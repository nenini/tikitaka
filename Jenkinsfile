pipeline {
    agent any

    parameters {
        booleanParam(
            name: 'DEPLOY_PRODUCTION',
            defaultValue: false,
            description: 'feature/#44 브랜치에서 운영 배포를 수동 검증할 때만 선택합니다. develop 브랜치는 자동 배포됩니다.'
        )
    }

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        NODE_IMAGE = 'node:22-alpine'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Backend Test') {
            steps {
                dir('backend') {
                    sh 'chmod +x gradlew'
                    sh './gradlew clean test --no-daemon'
                }
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'backend/build/test-results/test/*.xml'
                }
            }
        }

        stage('Vision Package Build') {
            steps {
                sh '''
                    docker run --rm \
                      --user "$(id -u):$(id -g)" \
                      -e HOME=/tmp \
                      -v "$WORKSPACE:/workspace" \
                      -w /workspace/ai/vision-analysis \
                      "$NODE_IMAGE" \
                      sh -c 'corepack pnpm install --frozen-lockfile && corepack pnpm run build'
                '''
            }
        }

        stage('Frontend Check') {
            steps {
                // BT_REQUIRE_VISION_MODEL=1 — MediaPipe 모델(.task)은 저장소에 없고 npm ci 의
                // postinstall 이 내려받는다. 하나라도 빠지면 Vision Worker 초기화가 통째로
                // 실패해 표정·시선 분석이 죽은 채로 배포되므로, 여기서 빌드를 멈춘다.
                sh '''
                    docker run --rm \
                      --user "$(id -u):$(id -g)" \
                      -e HOME=/tmp \
                      -e BT_REQUIRE_VISION_MODEL=1 \
                      -v "$WORKSPACE:/workspace" \
                      -w /workspace/frontend \
                      "$NODE_IMAGE" \
                      sh -c 'npm ci && npm run lint && npm run build'
                '''
            }
        }

        stage('Backend Image Build') {
            steps {
                sh 'docker build --target runtime -t a307-backend:ci-${BUILD_NUMBER} backend'
            }
        }

        stage('Frontend Image Build') {
            steps {
                sh 'docker build -f frontend/Dockerfile.prod -t a307-frontend:ci-${BUILD_NUMBER} .'
            }
        }

        stage('AI Service Image Build') {
            parallel {
                stage('Face Analysis Image') {
                    steps {
                        sh 'docker build -t a307-face-analysis:ci-${BUILD_NUMBER} ai/face-analysis'
                    }
                }
                stage('Chatbot Image') {
                    steps {
                        sh 'docker build -t a307-chatbot:ci-${BUILD_NUMBER} ai/chatbot'
                    }
                }
            }
        }

        stage('Deployment Decision') {
            steps {
                script {
                    echo "GIT_BRANCH=${env.GIT_BRANCH ?: '(empty)'}, " +
                         "BRANCH_NAME=${env.BRANCH_NAME ?: '(empty)'}, " +
                         "DEPLOY_PRODUCTION=${params.DEPLOY_PRODUCTION}"
                }
            }
        }

        stage('Deploy Production') {
            when {
                expression {
                    def branch = env.GIT_BRANCH ?: env.BRANCH_NAME ?: ''
                    def isDevelop = branch == 'develop' || branch.endsWith('/develop')
                    def isDeploymentFeature = branch == 'feature/#44-cicd-deployment' ||
                                              branch.endsWith('/feature/#44-cicd-deployment') ||
                                              branch.endsWith('feature/#44-cicd-deployment') ||
                                              branch == 'feature/#44-ai-service-deployment' ||
                                              branch.endsWith('/feature/#44-ai-service-deployment') ||
                                              branch.endsWith('feature/#44-ai-service-deployment')
                    if (!isDevelop) {
                        isDevelop = sh(
                            script: '''test "$(git rev-parse HEAD)" = "$(git rev-parse refs/remotes/origin/develop)"''',
                            returnStatus: true
                        ) == 0
                    }
                    if (!isDeploymentFeature) {
                        isDeploymentFeature = sh(
                            script: '''
                                test "$(git rev-parse HEAD)" = "$(git rev-parse 'refs/remotes/origin/feature/#44-cicd-deployment')" ||
                                test "$(git rev-parse HEAD)" = "$(git rev-parse 'refs/remotes/origin/feature/#44-ai-service-deployment')"
                            ''',
                            returnStatus: true
                        ) == 0
                    }
                    return isDevelop || (isDeploymentFeature && params.DEPLOY_PRODUCTION == true)
                }
            }
            steps {
                sh 'chmod +x scripts/deploy-prod.sh'
                sh '''
                    BACKEND_CI_IMAGE=a307-backend:ci-${BUILD_NUMBER} \
                    FRONTEND_CI_IMAGE=a307-frontend:ci-${BUILD_NUMBER} \
                    FACE_ANALYSIS_CI_IMAGE=a307-face-analysis:ci-${BUILD_NUMBER} \
                    CHATBOT_CI_IMAGE=a307-chatbot:ci-${BUILD_NUMBER} \
                    scripts/deploy-prod.sh
                '''
            }
        }
    }

    post {
        always {
            sh 'docker image rm a307-backend:ci-${BUILD_NUMBER} >/dev/null 2>&1 || true'
            sh 'docker image rm a307-frontend:ci-${BUILD_NUMBER} >/dev/null 2>&1 || true'
            sh 'docker image rm a307-face-analysis:ci-${BUILD_NUMBER} >/dev/null 2>&1 || true'
            sh 'docker image rm a307-chatbot:ci-${BUILD_NUMBER} >/dev/null 2>&1 || true'
            deleteDir()
        }
    }
}
