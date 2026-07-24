"use strict";

const elements = {
  serviceBadge: document.querySelector("#serviceBadge"),
  serviceText: document.querySelector("#serviceText"),
  groupInputs: [...document.querySelectorAll('input[name="analysisGroup"]')],
  camera: document.querySelector("#camera"),
  capturedPreview: document.querySelector("#capturedPreview"),
  mediaStage: document.querySelector("#mediaStage"),
  canvas: document.querySelector("#captureCanvas"),
  startCameraButton: document.querySelector("#startCameraButton"),
  captureButton: document.querySelector("#captureButton"),
  selectPhotoButton: document.querySelector("#selectPhotoButton"),
  fileInput: document.querySelector("#fileInput"),
  retakeButton: document.querySelector("#retakeButton"),
  captureMessage: document.querySelector("#captureMessage"),
  loadingTitle: document.querySelector("#loadingTitle"),
  loadingMessage: document.querySelector("#loadingMessage"),
  resultEmpty: document.querySelector("#resultEmpty"),
  resultContent: document.querySelector("#resultContent"),
  resultStatus: document.querySelector("#resultStatus"),
  resultLead: document.querySelector("#resultLead"),
  tagList: document.querySelector("#tagList"),
  qualitySummary: document.querySelector("#qualitySummary"),
};

const reasonMessages = {
  NO_FACE: "얼굴을 찾지 못했어요. 얼굴 전체가 보이도록 다시 촬영해 주세요.",
  MULTIPLE_FACES: "여러 얼굴이 감지됐어요. 한 명만 화면에 나오게 해 주세요.",
  LOW_LIGHT: "사진이 너무 어두워요. 얼굴 앞쪽을 밝게 해 주세요.",
  OVEREXPOSED: "사진이 너무 밝아요. 강한 조명을 피해서 다시 촬영해 주세요.",
  SEVERE_BLUR: "사진이 흔들리거나 흐려요. 잠시 멈춘 뒤 다시 촬영해 주세요.",
  EXTREME_HEAD_POSE: "고개가 많이 기울어졌어요. 정면을 보고 다시 촬영해 주세요.",
  INVALID_IMAGE: "사진을 읽을 수 없어요. 다른 사진으로 다시 시도해 주세요.",
};

const errorMessages = {
  MODEL_UNAVAILABLE: "분석 모델을 준비하지 못했어요. 서버 터미널을 확인해 주세요.",
  PAYLOAD_TOO_LARGE: "사진 용량이 너무 커요. 더 작은 사진으로 시도해 주세요.",
  UNSUPPORTED_MEDIA_TYPE: "JPEG, PNG 또는 WebP 사진만 사용할 수 있어요.",
  MEDIA_TYPE_MISMATCH: "사진 형식과 파일 정보가 일치하지 않아요.",
  IMAGE_DIMENSIONS_TOO_LARGE: "사진 해상도가 너무 커요.",
  INVALID_ANALYSIS_GROUP: "여성 또는 남성 후보군을 먼저 선택해 주세요.",
};

let mediaStream = null;
let previewUrl = null;
let requestInFlight = false;

function selectedGroup() {
  return elements.groupInputs.find((input) => input.checked)?.value ?? null;
}

function setCaptureMessage(message, isError = false) {
  elements.captureMessage.textContent = message;
  elements.captureMessage.classList.toggle("is-error", isError);
}

function setStage(mode) {
  elements.mediaStage.classList.remove("is-idle", "is-live", "is-captured", "is-loading");
  elements.mediaStage.classList.add(`is-${mode}`);
}

function updateCaptureAvailability() {
  const ready = Boolean(mediaStream) && elements.camera.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  elements.captureButton.disabled = requestInFlight || !ready || !selectedGroup();
}

function clearPreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  elements.capturedPreview.removeAttribute("src");
}

function stopCamera() {
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
  }
  mediaStream = null;
  elements.camera.srcObject = null;
  updateCaptureAvailability();
}

function clearResult() {
  elements.resultContent.hidden = true;
  elements.resultEmpty.hidden = false;
  elements.tagList.replaceChildren();
  elements.qualitySummary.replaceChildren();
}

function showLoading(title, message) {
  elements.loadingTitle.textContent = title;
  elements.loadingMessage.textContent = message;
  elements.mediaStage.classList.add("is-loading");
}

function hideLoading() {
  elements.mediaStage.classList.remove("is-loading");
}

function setBusy(busy) {
  requestInFlight = busy;
  elements.startCameraButton.disabled = busy;
  elements.selectPhotoButton.disabled = busy;
  elements.fileInput.disabled = busy;
  elements.groupInputs.forEach((input) => {
    input.disabled = busy;
  });
  updateCaptureAvailability();
}

function readableError(errorCode, fallback) {
  return errorMessages[errorCode] ?? fallback ?? "요청을 처리하지 못했어요. 다시 시도해 주세요.";
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(readableError(payload.errorCode, `요청 실패 (${response.status})`));
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("분석 시간이 오래 걸리고 있어요. 서버 상태를 확인한 뒤 다시 시도해 주세요.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function checkService() {
  try {
    const health = await fetchJson("/internal/v1/face-analysis/health");
    elements.serviceBadge.className = `service-badge ${health.analysisReady ? "is-ready" : "is-error"}`;
    elements.serviceText.textContent = health.analysisReady ? "FaceNet512 준비됨" : "품질 검사만 사용 가능";
  } catch (error) {
    elements.serviceBadge.className = "service-badge is-error";
    elements.serviceText.textContent = "서버 연결 확인 필요";
    setCaptureMessage(error.message, true);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setCaptureMessage("이 브라우저에서는 카메라를 사용할 수 없어요. 사진 선택을 이용해 주세요.", true);
    return;
  }
  stopCamera();
  clearPreview();
  clearResult();
  setCaptureMessage("카메라 권한을 확인하고 있어요.");
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    });
    elements.camera.srcObject = mediaStream;
    await elements.camera.play();
    setStage("live");
    elements.startCameraButton.textContent = "카메라 다시 시작";
    elements.retakeButton.hidden = true;
    setCaptureMessage(
      selectedGroup()
        ? "얼굴을 가이드 안에 맞춘 뒤 촬영해 주세요."
        : "후보군을 선택하면 촬영 버튼이 활성화됩니다.",
    );
    updateCaptureAvailability();
  } catch (error) {
    stopCamera();
    setStage("idle");
    const message = error.name === "NotAllowedError"
      ? "카메라 권한이 거부됐어요. 브라우저 주소창에서 권한을 허용하거나 사진 선택을 이용해 주세요."
      : "카메라를 시작하지 못했어요. 다른 앱에서 카메라를 사용 중인지 확인해 주세요.";
    setCaptureMessage(message, true);
  }
}

function canvasBlob(canvas, type = "image/jpeg", quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("사진을 준비하지 못했어요."));
      }
    }, type, quality);
  });
}

async function captureCameraFrame() {
  if (!selectedGroup()) {
    setCaptureMessage("분석 후보군을 먼저 선택해 주세요.", true);
    return;
  }
  if (!mediaStream || !elements.camera.videoWidth) {
    setCaptureMessage("카메라 화면이 준비되지 않았어요.", true);
    return;
  }
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / elements.camera.videoWidth);
  elements.canvas.width = Math.round(elements.camera.videoWidth * scale);
  elements.canvas.height = Math.round(elements.camera.videoHeight * scale);
  const context = elements.canvas.getContext("2d", { alpha: false });
  context.drawImage(elements.camera, 0, 0, elements.canvas.width, elements.canvas.height);
  const blob = await canvasBlob(elements.canvas);
  stopCamera();
  await analyzeBlob(blob);
}

async function imageFileToBlob(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("JPEG, PNG 또는 WebP 사진을 선택해 주세요.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / bitmap.width);
    elements.canvas.width = Math.round(bitmap.width * scale);
    elements.canvas.height = Math.round(bitmap.height * scale);
    const context = elements.canvas.getContext("2d", { alpha: false });
    context.drawImage(bitmap, 0, 0, elements.canvas.width, elements.canvas.height);
    return await canvasBlob(elements.canvas);
  } finally {
    bitmap.close();
  }
}

function showCapturedPreview(blob) {
  clearPreview();
  previewUrl = URL.createObjectURL(blob);
  elements.capturedPreview.src = previewUrl;
  setStage("captured");
  elements.retakeButton.hidden = false;
}

function renderStatus(status) {
  const labels = {
    SUCCESS: ["가까운 후보", "is-success"],
    UNCERTAIN: ["참고용 후보", "is-uncertain"],
    RETAKE_REQUIRED: ["재촬영 필요", "is-retake"],
  };
  const [label, className] = labels[status] ?? ["확인 필요", "is-error"];
  elements.resultStatus.textContent = label;
  elements.resultStatus.className = `result-status ${className}`;
}

function qualityDetail(quality) {
  if (!quality) {
    return "";
  }
  const pieces = [];
  if (typeof quality.brightnessScore === "number") {
    pieces.push(`밝기 ${Math.round(quality.brightnessScore * 100)}`);
  }
  if (typeof quality.blurScore === "number") {
    pieces.push(`선명도 ${Math.round(quality.blurScore * 100)}`);
  }
  if (typeof quality.rollDegrees === "number") {
    pieces.push(`기울기 ${Math.abs(quality.rollDegrees).toFixed(1)}°`);
  }
  return pieces.join(" · ");
}

function renderResult(payload) {
  elements.resultEmpty.hidden = true;
  elements.resultContent.hidden = false;
  elements.tagList.replaceChildren();
  elements.qualitySummary.replaceChildren();
  renderStatus(payload.status);

  if (payload.status === "RETAKE_REQUIRED") {
    const reasons = payload.quality?.reasons ?? [];
    elements.resultLead.textContent = reasons.length
      ? reasons.map((reason) => reasonMessages[reason] ?? reason).join(" ")
      : "사진 품질을 확인한 뒤 다시 촬영해 주세요.";
    return;
  }

  elements.resultLead.textContent = payload.status === "SUCCESS"
    ? "후보 간 차이가 확인됐어요. 가장 가까운 오락성 얼굴상은 다음과 같습니다."
    : "후보 간 차이가 크지 않아 참고용으로 가장 가까운 얼굴상을 보여드려요.";

  for (const tag of payload.tags ?? []) {
    const item = document.createElement("div");
    item.className = "tag-item";

    const rank = document.createElement("span");
    rank.className = "tag-rank";
    rank.textContent = `TOP ${tag.rank}`;

    const name = document.createElement("span");
    name.className = "tag-name";
    const strong = document.createElement("strong");
    strong.textContent = tag.displayName;
    const small = document.createElement("small");
    small.textContent = "후보군 내부 상대 유사도";
    name.append(strong, small);

    const score = document.createElement("span");
    score.className = "tag-score";
    score.textContent = `${(tag.relativeScore * 100).toFixed(1)}%`;

    item.append(rank, name, score);
    elements.tagList.append(item);
  }

  const detail = qualityDetail(payload.quality);
  if (detail) {
    const qualityText = document.createElement("span");
    qualityText.textContent = `촬영 품질 참고값 · ${detail}`;
    elements.qualitySummary.append(qualityText);
  }
}

async function analyzeBlob(blob) {
  const group = selectedGroup();
  if (!group) {
    setCaptureMessage("분석 후보군을 먼저 선택해 주세요.", true);
    return;
  }
  showCapturedPreview(blob);
  setBusy(true);
  showLoading("사진 품질 확인 중", "원본 사진은 서버에 저장하지 않습니다.");
  setCaptureMessage("사진을 메모리에서 분석하고 있어요.");
  try {
    const quality = await fetchJson("/internal/v1/face-analysis/quality-check", {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    });
    if (quality.status === "RETAKE_REQUIRED") {
      renderResult(quality);
      setCaptureMessage("사진 품질을 확인하고 다시 촬영해 주세요.", true);
      return;
    }

    showLoading("얼굴상 비교 중", "FaceNet512 상대 유사도를 계산하고 있어요.");
    const result = await fetchJson(
      `/internal/v1/face-analysis/analyze?analysis_group=${encodeURIComponent(group)}`,
      {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      },
    );
    renderResult(result);
    setCaptureMessage("분석이 끝났어요. 사진은 서버에 저장되지 않았습니다.");
  } catch (error) {
    elements.resultEmpty.hidden = true;
    elements.resultContent.hidden = false;
    elements.tagList.replaceChildren();
    elements.qualitySummary.replaceChildren();
    elements.resultStatus.textContent = "분석 오류";
    elements.resultStatus.className = "result-status is-error";
    elements.resultLead.textContent = error.message;
    setCaptureMessage(error.message, true);
  } finally {
    hideLoading();
    setBusy(false);
  }
}

async function handleFileSelection(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) {
    return;
  }
  if (!selectedGroup()) {
    setCaptureMessage("사진을 분석하기 전에 후보군을 선택해 주세요.", true);
    return;
  }
  stopCamera();
  try {
    setCaptureMessage("선택한 사진을 메모리에서 준비하고 있어요.");
    const blob = await imageFileToBlob(file);
    await analyzeBlob(blob);
  } catch (error) {
    setCaptureMessage(error.message, true);
  }
}

async function resetForRetake() {
  clearPreview();
  clearResult();
  setStage("idle");
  elements.retakeButton.hidden = true;
  await startCamera();
}

elements.startCameraButton.addEventListener("click", startCamera);
elements.captureButton.addEventListener("click", () => {
  captureCameraFrame().catch((error) => setCaptureMessage(error.message, true));
});
elements.selectPhotoButton.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", handleFileSelection);
elements.retakeButton.addEventListener("click", resetForRetake);
elements.groupInputs.forEach((input) => {
  input.addEventListener("change", () => {
    updateCaptureAvailability();
    setCaptureMessage(
      mediaStream
        ? "얼굴을 가이드 안에 맞춘 뒤 촬영해 주세요."
        : "카메라를 시작하거나 사진을 선택해 주세요.",
    );
  });
});
elements.camera.addEventListener("loadeddata", updateCaptureAvailability);
window.addEventListener("pagehide", () => {
  stopCamera();
  clearPreview();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopCamera();
  }
});

checkService();
