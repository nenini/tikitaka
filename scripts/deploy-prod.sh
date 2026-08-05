#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/a307/app}"
ENV_FILE="${ENV_FILE:-/opt/a307/.env.prod}"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
BACKEND_IMAGE_NAME="a307-backend"
FRONTEND_IMAGE_NAME="a307-frontend"
FACE_ANALYSIS_IMAGE_NAME="a307-face-analysis"
CHATBOT_IMAGE_NAME="a307-chatbot"
BACKEND_CI_IMAGE="${BACKEND_CI_IMAGE:-}"
FRONTEND_CI_IMAGE="${FRONTEND_CI_IMAGE:-}"
FACE_ANALYSIS_CI_IMAGE="${FACE_ANALYSIS_CI_IMAGE:-}"
CHATBOT_CI_IMAGE="${CHATBOT_CI_IMAGE:-}"
RELEASE_TAG="deploy-${BUILD_NUMBER:-manual}-$(date -u +%Y%m%d%H%M%S)"
BACKEND_CANDIDATE_IMAGE="${BACKEND_IMAGE_NAME}:${RELEASE_TAG}"
FRONTEND_CANDIDATE_IMAGE="${FRONTEND_IMAGE_NAME}:${RELEASE_TAG}"
FACE_ANALYSIS_CANDIDATE_IMAGE="${FACE_ANALYSIS_IMAGE_NAME}:${RELEASE_TAG}"
CHATBOT_CANDIDATE_IMAGE="${CHATBOT_IMAGE_NAME}:${RELEASE_TAG}"
BACKEND_ROLLBACK_IMAGE="${BACKEND_IMAGE_NAME}:rollback-${BUILD_NUMBER:-manual}"
FRONTEND_ROLLBACK_IMAGE="${FRONTEND_IMAGE_NAME}:rollback-${BUILD_NUMBER:-manual}"
FACE_ANALYSIS_ROLLBACK_IMAGE="${FACE_ANALYSIS_IMAGE_NAME}:rollback-${BUILD_NUMBER:-manual}"
CHATBOT_ROLLBACK_IMAGE="${CHATBOT_IMAGE_NAME}:rollback-${BUILD_NUMBER:-manual}"
LOCK_FILE="/tmp/a307-prod-deploy.lock"
BACKUP_DIR="$(mktemp -d /tmp/a307-prod-config.XXXXXX)"
HAD_PREVIOUS_BACKEND_IMAGE=false
HAD_PREVIOUS_FRONTEND_IMAGE=false
HAD_PREVIOUS_FACE_ANALYSIS_IMAGE=false
HAD_PREVIOUS_CHATBOT_IMAGE=false
DEPLOY_STARTED=false

compose() {
    APP_VERSION=latest FRONTEND_VERSION=latest \
    FACE_ANALYSIS_VERSION=latest CHATBOT_VERSION=latest docker compose \
        --env-file "${ENV_FILE}" \
        -f "${COMPOSE_FILE}" \
        "$@"
}

restore_config() {
    if [[ -f "${BACKUP_DIR}/docker-compose.prod.yml" ]]; then
        cp "${BACKUP_DIR}/docker-compose.prod.yml" "${COMPOSE_FILE}"
    fi
    if [[ -f "${BACKUP_DIR}/default.conf" ]]; then
        mkdir -p "${DEPLOY_DIR}/nginx/conf.d"
        cp "${BACKUP_DIR}/default.conf" "${DEPLOY_DIR}/nginx/conf.d/default.conf"
    fi
}

rollback() {
    local exit_code=$?
    trap - ERR

    echo "Deployment failed. Restoring the previous production release."
    if [[ "${DEPLOY_STARTED}" == true ]]; then
        if [[ "${HAD_PREVIOUS_FACE_ANALYSIS_IMAGE}" == false ]]; then
            compose rm -sf face-analysis || true
        fi
        if [[ "${HAD_PREVIOUS_CHATBOT_IMAGE}" == false ]]; then
            compose rm -sf chatbot || true
        fi
    fi
    restore_config

    if [[ "${DEPLOY_STARTED}" == true ]]; then
        if [[ "${HAD_PREVIOUS_BACKEND_IMAGE}" == true ]]; then
            docker tag "${BACKEND_ROLLBACK_IMAGE}" "${BACKEND_IMAGE_NAME}:latest"
            compose up -d --no-build --no-deps --force-recreate backend
        fi
        if [[ "${HAD_PREVIOUS_FRONTEND_IMAGE}" == true ]]; then
            docker tag "${FRONTEND_ROLLBACK_IMAGE}" "${FRONTEND_IMAGE_NAME}:latest"
            if compose config --services | grep -qx frontend; then
                compose up -d --no-build --no-deps --force-recreate frontend
            fi
        fi
        if [[ "${HAD_PREVIOUS_FACE_ANALYSIS_IMAGE}" == true ]]; then
            docker tag "${FACE_ANALYSIS_ROLLBACK_IMAGE}" "${FACE_ANALYSIS_IMAGE_NAME}:latest"
            if compose config --services | grep -qx face-analysis; then
                compose up -d --no-build --no-deps --force-recreate face-analysis
            fi
        fi
        if [[ "${HAD_PREVIOUS_CHATBOT_IMAGE}" == true ]]; then
            docker tag "${CHATBOT_ROLLBACK_IMAGE}" "${CHATBOT_IMAGE_NAME}:latest"
            if compose config --services | grep -qx chatbot; then
                compose up -d --no-build --no-deps --force-recreate chatbot
            fi
        fi
        compose up -d --no-build --force-recreate nginx
    fi

    echo "Rollback completed. Inspect service logs before retrying the deployment."
    exit "${exit_code}"
}

cleanup() {
    rm -rf "${BACKUP_DIR}"
    docker image rm "${BACKEND_CANDIDATE_IMAGE}" >/dev/null 2>&1 || true
    docker image rm "${FRONTEND_CANDIDATE_IMAGE}" >/dev/null 2>&1 || true
    docker image rm "${FACE_ANALYSIS_CANDIDATE_IMAGE}" >/dev/null 2>&1 || true
    docker image rm "${CHATBOT_CANDIDATE_IMAGE}" >/dev/null 2>&1 || true
    docker image rm "${BACKEND_ROLLBACK_IMAGE}" >/dev/null 2>&1 || true
    docker image rm "${FRONTEND_ROLLBACK_IMAGE}" >/dev/null 2>&1 || true
    docker image rm "${FACE_ANALYSIS_ROLLBACK_IMAGE}" >/dev/null 2>&1 || true
    docker image rm "${CHATBOT_ROLLBACK_IMAGE}" >/dev/null 2>&1 || true
}

trap rollback ERR
trap cleanup EXIT

exec 9>"${LOCK_FILE}"
flock -n 9 || {
    echo "Another production deployment is already running."
    exit 1
}

[[ -r "${ENV_FILE}" ]] || {
    echo "Production environment file is not readable: ${ENV_FILE}"
    exit 1
}

FACE_ANALYSIS_ARTIFACTS_DIR="${FACE_ANALYSIS_ARTIFACTS_DIR:-/opt/a307/ai-data/face-analysis/artifacts}"
FACE_ANALYSIS_DATA_DIR="${FACE_ANALYSIS_DATA_DIR:-/opt/a307/ai-data/face-analysis/data}"

[[ -f "${FACE_ANALYSIS_ARTIFACTS_DIR}/face_detection_yunet_2023mar.onnx" ]] || {
    echo "Missing Face Analysis detector: ${FACE_ANALYSIS_ARTIFACTS_DIR}/face_detection_yunet_2023mar.onnx"
    exit 1
}
[[ -f "${FACE_ANALYSIS_ARTIFACTS_DIR}/.deepface/weights/facenet512_weights.h5" ]] || {
    echo "Missing FaceNet512 weights: ${FACE_ANALYSIS_ARTIFACTS_DIR}/.deepface/weights/facenet512_weights.h5"
    exit 1
}
[[ -f "${FACE_ANALYSIS_DATA_DIR}/processing_report.csv" ]] || {
    echo "Missing Face Analysis report: ${FACE_ANALYSIS_DATA_DIR}/processing_report.csv"
    exit 1
}
find "${FACE_ANALYSIS_DATA_DIR}/processed" -type f -print -quit 2>/dev/null | grep -q . || {
    echo "Missing Face Analysis reference images under ${FACE_ANALYSIS_DATA_DIR}/processed"
    exit 1
}

mkdir -p "${DEPLOY_DIR}/nginx/conf.d"

if [[ -f "${COMPOSE_FILE}" ]]; then
    cp "${COMPOSE_FILE}" "${BACKUP_DIR}/docker-compose.prod.yml"
fi
if [[ -f "${DEPLOY_DIR}/nginx/conf.d/default.conf" ]]; then
    cp "${DEPLOY_DIR}/nginx/conf.d/default.conf" "${BACKUP_DIR}/default.conf"
fi

if [[ -n "${BACKEND_CI_IMAGE}" ]] && docker image inspect "${BACKEND_CI_IMAGE}" >/dev/null 2>&1; then
    docker tag "${BACKEND_CI_IMAGE}" "${BACKEND_CANDIDATE_IMAGE}"
else
    docker build --target runtime -t "${BACKEND_CANDIDATE_IMAGE}" backend
fi

if [[ -n "${FRONTEND_CI_IMAGE}" ]] && docker image inspect "${FRONTEND_CI_IMAGE}" >/dev/null 2>&1; then
    docker tag "${FRONTEND_CI_IMAGE}" "${FRONTEND_CANDIDATE_IMAGE}"
else
    docker build -f frontend/Dockerfile.prod -t "${FRONTEND_CANDIDATE_IMAGE}" .
fi

if [[ -n "${FACE_ANALYSIS_CI_IMAGE}" ]] && docker image inspect "${FACE_ANALYSIS_CI_IMAGE}" >/dev/null 2>&1; then
    docker tag "${FACE_ANALYSIS_CI_IMAGE}" "${FACE_ANALYSIS_CANDIDATE_IMAGE}"
else
    docker build -t "${FACE_ANALYSIS_CANDIDATE_IMAGE}" ai/face-analysis
fi

if [[ -n "${CHATBOT_CI_IMAGE}" ]] && docker image inspect "${CHATBOT_CI_IMAGE}" >/dev/null 2>&1; then
    docker tag "${CHATBOT_CI_IMAGE}" "${CHATBOT_CANDIDATE_IMAGE}"
else
    docker build -t "${CHATBOT_CANDIDATE_IMAGE}" ai/chatbot
fi

if docker image inspect "${BACKEND_IMAGE_NAME}:latest" >/dev/null 2>&1; then
    docker tag "${BACKEND_IMAGE_NAME}:latest" "${BACKEND_ROLLBACK_IMAGE}"
    HAD_PREVIOUS_BACKEND_IMAGE=true
fi

if docker image inspect "${FRONTEND_IMAGE_NAME}:latest" >/dev/null 2>&1; then
    docker tag "${FRONTEND_IMAGE_NAME}:latest" "${FRONTEND_ROLLBACK_IMAGE}"
    HAD_PREVIOUS_FRONTEND_IMAGE=true
fi

if docker image inspect "${FACE_ANALYSIS_IMAGE_NAME}:latest" >/dev/null 2>&1; then
    docker tag "${FACE_ANALYSIS_IMAGE_NAME}:latest" "${FACE_ANALYSIS_ROLLBACK_IMAGE}"
    HAD_PREVIOUS_FACE_ANALYSIS_IMAGE=true
fi

if docker image inspect "${CHATBOT_IMAGE_NAME}:latest" >/dev/null 2>&1; then
    docker tag "${CHATBOT_IMAGE_NAME}:latest" "${CHATBOT_ROLLBACK_IMAGE}"
    HAD_PREVIOUS_CHATBOT_IMAGE=true
fi

cp docker-compose.prod.yml "${COMPOSE_FILE}"
cp nginx/conf.d/default.conf "${DEPLOY_DIR}/nginx/conf.d/default.conf"

docker tag "${BACKEND_CANDIDATE_IMAGE}" "${BACKEND_IMAGE_NAME}:latest"
docker tag "${FRONTEND_CANDIDATE_IMAGE}" "${FRONTEND_IMAGE_NAME}:latest"
docker tag "${FACE_ANALYSIS_CANDIDATE_IMAGE}" "${FACE_ANALYSIS_IMAGE_NAME}:latest"
docker tag "${CHATBOT_CANDIDATE_IMAGE}" "${CHATBOT_IMAGE_NAME}:latest"
DEPLOY_STARTED=true

compose config --quiet
compose up -d --no-build mysql
compose up -d --no-build --no-deps --force-recreate face-analysis chatbot
compose up -d --no-build --no-deps --force-recreate backend frontend
compose up -d --no-build --force-recreate nginx

echo "Waiting for the backend health check."
for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error \
        http://127.0.0.1:8080/actuator/health >/dev/null; then
        break
    fi

    if [[ "${attempt}" -eq 30 ]]; then
        echo "Backend health check failed."
        compose logs --tail=100 backend || true
        false
    fi

    sleep 5
done

compose exec -T frontend \
    wget --quiet --spider http://localhost/frontend-health

compose exec -T chatbot python -c \
    "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=5)"

compose exec -T chatbot python -c \
    "import os, urllib.request; urllib.request.urlopen(os.environ['OLLAMA_HOST'].rstrip('/') + '/api/version', timeout=10)"

compose exec -T face-analysis python -c \
    "import json, urllib.request; data=json.load(urllib.request.urlopen('http://localhost:8000/internal/v1/face-analysis/health', timeout=5)); assert data['analysisReady']"

curl --fail --silent --show-error \
    https://i15a307.p.ssafy.io/ai/face/internal/v1/face-analysis/health >/dev/null

curl --fail --silent --show-error \
    https://i15a307.p.ssafy.io/actuator/health >/dev/null

curl --fail --silent --show-error \
    https://i15a307.p.ssafy.io/ >/dev/null

compose ps
DEPLOY_STARTED=false
trap - ERR

echo "Production deployment succeeded: ${RELEASE_TAG}"
