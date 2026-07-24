"""Internal FastAPI boundary for memory-only face analysis."""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Callable, Literal

import cv2
from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from .facenet import (
    FaceNet512Embedder,
    FaceNetSimilarityPredictor,
    build_reference_memory,
    extract_reference_features,
    load_reference_samples,
)
from .inference import PredictionPolicy
from .geometry import (
    MediaPipeGeometryExtractor,
    build_geometry_reference_memory,
    extract_reference_geometry,
)
from .hybrid import GeometryAssistedPredictor
from .input_validation import (
    ImageInputError,
    decode_validated_image,
    read_limited_body,
)
from .labels import normalize_analysis_group
from .preprocessing import create_detector
from .service import FaceAnalysisService, ModelUnavailableError
from .settings import ServiceSettings


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


FaceTypeCode = Literal[
    "DOG",
    "CAT",
    "RABBIT",
    "FOX",
    "DEER",
    "TURTLE",
    "HAMSTER",
    "SNAKE",
    "DINOSAUR",
    "WOLF",
]


class QualityPayload(StrictModel):
    usable: bool
    reasons: list[str]
    faceCount: int
    faceAreaRatio: float | None
    brightnessScore: float | None
    blurScore: float | None
    rollDegrees: float | None


class TagPayload(StrictModel):
    code: FaceTypeCode
    displayName: str
    rank: int
    relativeScore: float


class AnalysisPayload(StrictModel):
    schemaVersion: int
    status: Literal["SUCCESS", "UNCERTAIN", "RETAKE_REQUIRED"]
    modelVersion: str
    analysisGroup: Literal["female", "male"] | None
    quality: QualityPayload
    tags: list[TagPayload]
    noticeCode: Literal["ENTERTAINMENT_ONLY"]


class HealthPayload(StrictModel):
    status: Literal["READY", "DEGRADED", "UNAVAILABLE"]
    modelVersion: str
    qualityCheckReady: bool
    analysisReady: bool


@dataclass(frozen=True)
class RuntimeState:
    service: FaceAnalysisService | None


ServiceFactory = Callable[[ServiceSettings], FaceAnalysisService]


def build_service(settings: ServiceSettings) -> FaceAnalysisService:
    detector = create_detector(
        settings.face_model_path,
        settings.detection_threshold,
    )
    try:
        embedder = FaceNet512Embedder(settings.facenet_home)
        samples = load_reference_samples(
            settings.reference_data_root,
            settings.reference_report_path,
        )
        references = build_reference_memory(
            samples,
            extract_reference_features(
                embedder,
                samples,
                settings.reference_batch_size,
            ),
        )
        facenet_predictor = FaceNetSimilarityPredictor(
            embedder,
            references,
            PredictionPolicy(
                success_threshold=settings.success_threshold,
                minimum_margin=settings.minimum_margin,
                second_suggestion_threshold=settings.second_suggestion_threshold,
            ),
            top_k=settings.similarity_top_k,
            temperature=settings.similarity_temperature,
            scoring_method=settings.similarity_scoring_method,
        )
        geometry_extractor = None
        try:
            geometry_extractor = MediaPipeGeometryExtractor(
                settings.face_landmarker_path
            )
            geometry_references = build_geometry_reference_memory(
                samples,
                extract_reference_geometry(
                    geometry_extractor,
                    samples,
                    settings.reference_batch_size,
                ),
            )
            predictor = GeometryAssistedPredictor(
                geometry_extractor,
                geometry_references,
                embedder,
                references,
                facenet_predictor.policy,
                geometry_temperature=settings.geometry_temperature,
                geometry_tie_margin=settings.geometry_tie_margin,
                geometry_weight=settings.geometry_weight,
                facenet_temperature=settings.similarity_temperature,
                facenet_top_k=settings.similarity_top_k,
                facenet_scoring_method=settings.similarity_scoring_method,
            )
        except (FileNotFoundError, ImportError, OSError, RuntimeError, ValueError):
            # Geometry is an enhancement. If its optional local asset/runtime is
            # unavailable, existing FaceNet similarity remains isolated and usable.
            if geometry_extractor is not None:
                geometry_extractor.close()
            predictor = facenet_predictor
    except (FileNotFoundError, ImportError, OSError, RuntimeError, ValueError):
        predictor = None
    return FaceAnalysisService(detector, predictor, settings)


def create_app(
    settings: ServiceSettings | None = None,
    service_factory: ServiceFactory = build_service,
) -> FastAPI:
    resolved_settings = settings or ServiceSettings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            service = await run_in_threadpool(service_factory, resolved_settings)
        except (
            FileNotFoundError,
            ImportError,
            OSError,
            RuntimeError,
            ValueError,
            cv2.error,
        ):
            service = None
        app.state.face_runtime = RuntimeState(service)
        try:
            yield
        finally:
            if service is not None:
                close = getattr(service, "close", None)
                if callable(close):
                    await run_in_threadpool(close)
            app.state.face_runtime = RuntimeState(None)

    app = FastAPI(
        title="Face Analysis API",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def privacy_response_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.exception_handler(ImageInputError)
    async def image_input_error_handler(
        _request: Request, exc: ImageInputError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"errorCode": exc.code},
        )

    def runtime_service(request: Request) -> FaceAnalysisService:
        runtime: RuntimeState = request.app.state.face_runtime
        if runtime.service is None:
            raise ImageInputError("MODEL_UNAVAILABLE", 503)
        return runtime.service

    async def request_image(request: Request):
        payload = await read_limited_body(request, resolved_settings.max_body_bytes)
        return decode_validated_image(
            payload,
            request.headers.get("content-type"),
            resolved_settings,
        )

    @app.get("/internal/v1/face-analysis/health", response_model=HealthPayload)
    async def health(request: Request):
        runtime: RuntimeState = request.app.state.face_runtime
        quality_ready = runtime.service is not None
        analysis_ready = bool(
            runtime.service is not None and runtime.service.analysis_available
        )
        if analysis_ready:
            status = "READY"
        elif quality_ready:
            status = "DEGRADED"
        else:
            status = "UNAVAILABLE"
        payload = {
            "status": status,
            "modelVersion": resolved_settings.model_version,
            "qualityCheckReady": quality_ready,
            "analysisReady": analysis_ready,
        }
        if runtime.service is None:
            return JSONResponse(status_code=503, content=payload)
        return payload

    @app.post(
        "/internal/v1/face-analysis/quality-check",
        response_model=AnalysisPayload,
    )
    async def quality_check(request: Request):
        service = runtime_service(request)
        image = await request_image(request)
        try:
            return await run_in_threadpool(service.quality_check, image)
        except (RuntimeError, cv2.error) as exc:
            raise ImageInputError("MODEL_UNAVAILABLE", 503) from exc

    @app.post(
        "/internal/v1/face-analysis/analyze",
        response_model=AnalysisPayload,
        include_in_schema=False,
    )
    @app.post(
        "/v1/face-analysis/analyze",
        response_model=AnalysisPayload,
    )
    async def analyze(request: Request, analysis_group: str):
        service = runtime_service(request)
        try:
            group = normalize_analysis_group(analysis_group)
        except ValueError as exc:
            raise ImageInputError("INVALID_ANALYSIS_GROUP", 422) from exc
        image = await request_image(request)
        try:
            return await run_in_threadpool(service.analyze, image, group)
        except ModelUnavailableError as exc:
            raise ImageInputError("MODEL_UNAVAILABLE", 503) from exc
        except (RuntimeError, cv2.error) as exc:
            raise ImageInputError("MODEL_UNAVAILABLE", 503) from exc

    return app


app = create_app()
