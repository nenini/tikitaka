pipeline {
    agent any

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
                      sh -c 'npm ci && npm run build'
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
    }

    post {
        always {
            sh 'docker image rm a307-backend:ci-${BUILD_NUMBER} >/dev/null 2>&1 || true'
            deleteDir()
        }
    }
}
