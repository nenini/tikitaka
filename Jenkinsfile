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
        timeout(time: 30, unit: 'MINUTES')
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
                sh '''
                    docker run --rm \
                      --user "$(id -u):$(id -g)" \
                      -e HOME=/tmp \
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

        stage('Deploy Production') {
            when {
                expression {
                    def branch = env.GIT_BRANCH ?: env.BRANCH_NAME ?: ''
                    return branch == 'origin/develop' ||
                           branch == 'develop' ||
                           ((branch == 'origin/feature/#44-cicd-deployment' ||
                             branch == 'feature/#44-cicd-deployment') &&
                            params.DEPLOY_PRODUCTION)
                }
            }
            steps {
                sh 'chmod +x scripts/deploy-prod.sh'
                sh 'CI_IMAGE=a307-backend:ci-${BUILD_NUMBER} scripts/deploy-prod.sh'
            }
        }
    }

    post {
        always {
            sh 'docker image rm a307-backend:ci-${BUILD_NUMBER} >/dev/null 2>&1 || true'
            deleteDir()
        }
    }
}
