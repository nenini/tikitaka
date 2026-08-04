#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/a307/app}"
ENV_FILE="${ENV_FILE:-/opt/a307/.env.prod}"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
IMAGE_NAME="a307-backend"
CI_IMAGE="${CI_IMAGE:-}"
RELEASE_TAG="deploy-${BUILD_NUMBER:-manual}-$(date -u +%Y%m%d%H%M%S)"
CANDIDATE_IMAGE="${IMAGE_NAME}:${RELEASE_TAG}"
ROLLBACK_IMAGE="${IMAGE_NAME}:rollback-${BUILD_NUMBER:-manual}"
LOCK_FILE="/tmp/a307-prod-deploy.lock"
BACKUP_DIR="$(mktemp -d /tmp/a307-prod-config.XXXXXX)"
HAD_PREVIOUS_IMAGE=false
DEPLOY_STARTED=false

compose() {
    APP_VERSION=latest docker compose \
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
    restore_config

    if [[ "${DEPLOY_STARTED}" == true && "${HAD_PREVIOUS_IMAGE}" == true ]]; then
        docker tag "${ROLLBACK_IMAGE}" "${IMAGE_NAME}:latest"
        compose up -d --no-build --no-deps --force-recreate backend
        compose up -d --no-build nginx
    fi

    echo "Rollback completed. Inspect service logs before retrying the deployment."
    exit "${exit_code}"
}

cleanup() {
    rm -rf "${BACKUP_DIR}"
    docker image rm "${CANDIDATE_IMAGE}" >/dev/null 2>&1 || true
    docker image rm "${ROLLBACK_IMAGE}" >/dev/null 2>&1 || true
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

mkdir -p "${DEPLOY_DIR}/nginx/conf.d"

if [[ -f "${COMPOSE_FILE}" ]]; then
    cp "${COMPOSE_FILE}" "${BACKUP_DIR}/docker-compose.prod.yml"
fi
if [[ -f "${DEPLOY_DIR}/nginx/conf.d/default.conf" ]]; then
    cp "${DEPLOY_DIR}/nginx/conf.d/default.conf" "${BACKUP_DIR}/default.conf"
fi

if [[ -n "${CI_IMAGE}" ]] && docker image inspect "${CI_IMAGE}" >/dev/null 2>&1; then
    docker tag "${CI_IMAGE}" "${CANDIDATE_IMAGE}"
else
    docker build --target runtime -t "${CANDIDATE_IMAGE}" backend
fi

if docker image inspect "${IMAGE_NAME}:latest" >/dev/null 2>&1; then
    docker tag "${IMAGE_NAME}:latest" "${ROLLBACK_IMAGE}"
    HAD_PREVIOUS_IMAGE=true
fi

cp docker-compose.prod.yml "${COMPOSE_FILE}"
cp nginx/conf.d/default.conf "${DEPLOY_DIR}/nginx/conf.d/default.conf"

docker tag "${CANDIDATE_IMAGE}" "${IMAGE_NAME}:latest"
DEPLOY_STARTED=true

compose config --quiet
compose up -d --no-build mysql backend nginx

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

curl --fail --silent --show-error \
    https://i15a307.p.ssafy.io/actuator/health >/dev/null

compose ps
DEPLOY_STARTED=false
trap - ERR

echo "Production deployment succeeded: ${RELEASE_TAG}"
