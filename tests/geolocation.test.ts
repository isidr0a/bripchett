import { it, expect, vi, afterEach } from 'vitest';
import { captureLocation } from '../apps/web/src/infrastructure/geolocation/browser-location';
type CapturedPosition = {
  coords: Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>;
  timestamp: number;
};
type PositionSuccess = (position: CapturedPosition) => void;
type PositionFailure = (error: { code: number }) => void;
afterEach(() => vi.unstubAllGlobals());
it('solicita una captura nueva y precisa sin confirmarla automáticamente', async () => {
  const getCurrentPosition = vi.fn(
    (success: PositionSuccess, _failure?: PositionFailure, _options?: PositionOptions) =>
      success({
        coords: { latitude: 7.77, longitude: -72.22, accuracy: 12 },
        timestamp: Date.now(),
      }),
  );
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  const point = await captureLocation();
  expect(point.latitude).toBe(7.77);
  expect(point).not.toHaveProperty('confirmed');
  expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 20000,
  });
});
it('explica la denegación del permiso', async () => {
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (_s: unknown, error: PositionFailure) => error({ code: 1 }),
    },
  });
  await expect(captureLocation()).rejects.toThrow('Permiso denegado');
});
it('permite informar GPS no disponible', async () => {
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (_s: unknown, error: PositionFailure) => error({ code: 2 }),
    },
  });
  await expect(captureLocation()).rejects.toThrow('GPS no disponible');
});
