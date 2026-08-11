# FE direct integration contract

## Confirmed flow

```text
FE camera
  -> AI image analysis
  -> FE receives analysis JSON
  -> FE sends the storage projection to BE
```

The AI service never calls the BE service. `SKIPPED` never calls the AI
service. The local file-selection control belongs only to the loopback demo
and must not be copied into the production FE.

## FE to AI

Use the browser camera, resize the frame to at most 1600px wide, encode it as a
JPEG or WebP `Blob`, and send the Blob itself. Do not use Base64, multipart
form data, a pixel array, or JSON.

```http
POST /v1/face-analysis/analyze?analysis_group=female
Content-Type: image/jpeg
Authorization: Bearer <token handled by the deployment boundary>

<encoded image bytes>
```

Supported content types are `image/jpeg`, `image/png`, and `image/webp`. The
maximum request size is 5 MiB by default. The FE may show a mirrored camera
preview, but it must send the original non-mirrored frame.

`analysis_group` is selected explicitly by the user or product flow. The AI
must not infer it from the image.

## AI to FE

Successful analysis:

```json
{
  "schemaVersion": 1,
  "status": "SUCCESS",
  "modelVersion": "face-type-facenet-geometry-v3-experimental",
  "analysisGroup": "female",
  "quality": {
    "usable": true,
    "reasons": [],
    "faceCount": 1,
    "faceAreaRatio": 0.214,
    "brightnessScore": 0.521,
    "blurScore": 0.784,
    "rollDegrees": 1.32
  },
  "tags": [
    {
      "code": "DOG",
      "displayName": "강아지상",
      "rank": 1,
      "relativeScore": 0.342118
    }
  ],
  "noticeCode": "ENTERTAINMENT_ONLY"
}
```

The ten storage codes are:

```text
DOG, CAT, RABBIT, FOX, DEER,
TURTLE, HAMSTER, SNAKE, DINOSAUR, WOLF
```

`TURTLE` is displayed as `꼬북이상`. `TURTLE` and `HAMSTER` are available only
in the female result space; `WOLF` is available only in the male result
space.

## FE to BE storage projection

For `SUCCESS`, store the rank-one code:

```json
{
  "faceType": "DOG",
  "analysisStatus": "SUCCESS",
  "analysisModelVersion": "face-type-facenet-geometry-v3-experimental"
}
```

For `UNCERTAIN`, the AI still returns at least one suggestion. Store the
rank-one suggestion together with its uncertainty:

```json
{
  "faceType": "HAMSTER",
  "analysisStatus": "UNCERTAIN",
  "analysisModelVersion": "face-type-facenet-geometry-v3-experimental"
}
```

For `RETAKE_REQUIRED`, show the reason in the FE and do not update the BE
value. The AI response has no tags:

```json
{
  "status": "RETAKE_REQUIRED",
  "tags": [],
  "quality": {
    "usable": false,
    "reasons": ["SEVERE_BLUR"]
  }
}
```

For `SKIPPED`, do not call the AI. The FE sends this directly to the BE:

```json
{
  "faceType": null,
  "analysisStatus": "SKIPPED",
  "analysisModelVersion": null
}
```

The FE must not send `quality`, `relativeScore`, image bytes, a face crop,
landmarks, blendshapes, or an embedding to the BE.

## Error handling

- `400 INVALID_IMAGE`: the body is empty, corrupt, or cannot be decoded.
- `413 PAYLOAD_TOO_LARGE`: the encoded image exceeds the configured limit.
- `413 IMAGE_DIMENSIONS_TOO_LARGE`: decoded dimensions exceed the limit.
- `415 UNSUPPORTED_MEDIA_TYPE`: content type is not JPEG, PNG, or WebP.
- `415 MEDIA_TYPE_MISMATCH`: declared type and image signature differ.
- `422 INVALID_ANALYSIS_GROUP`: group is not an allowed explicit value.
- `503 MODEL_UNAVAILABLE`: analysis is temporarily unavailable.

Analysis responses and errors include `Cache-Control: no-store`.
