export async function getLocalMedia(constraints: MediaStreamConstraints = { audio: true, video: true }
): Promise<MediaStream> {
    // 권한 거부/장치 없음 에러
    return navigator.mediaDevices.getUserMedia(constraints)
}

// 마이크/카메라 잠깐 끄기
export function setTrackEnabled(stream: MediaStream, kind: 'audio' | 'video', enabled: boolean): void {
    for (const track of stream.getTracks()) {
        if (track.kind === kind) track.enabled = enabled
    }
}

// 세션종료시 모든 트랙 정지
export function stopStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) track.stop()
}