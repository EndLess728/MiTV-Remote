// Mock react-native Dimensions before importing scale utilities
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Dimensions.get = jest.fn().mockReturnValue({ width: 375, height: 812 });
  return RN;
});

import { moderateScale, moderateVerticalScale, scale, verticalScale } from '../scale';

// Guideline base: 350 wide, 680 tall
// Device mock: 375 wide (shortDimension), 812 tall (longDimension)

describe('scale utilities', () => {
  it('scale() returns a positive number', () => {
    expect(scale(100)).toBeGreaterThan(0);
  });

  it('verticalScale() returns a positive number', () => {
    expect(verticalScale(100)).toBeGreaterThan(0);
  });

  it('moderateScale() with factor=0 returns the original size', () => {
    expect(moderateScale(100, 0)).toBe(100);
  });

  it('moderateScale() with factor=1 matches full scale()', () => {
    expect(moderateScale(100, 1)).toBeCloseTo(scale(100));
  });

  it('moderateScale() default factor is between original and full scale', () => {
    const raw = 100;
    const full = scale(raw);
    const moderate = moderateScale(raw);
    if (full >= raw) {
      expect(moderate).toBeGreaterThanOrEqual(raw);
      expect(moderate).toBeLessThanOrEqual(full);
    } else {
      expect(moderate).toBeLessThanOrEqual(raw);
      expect(moderate).toBeGreaterThanOrEqual(full);
    }
  });

  it('moderateVerticalScale() with factor=0 returns the original size', () => {
    expect(moderateVerticalScale(100, 0)).toBe(100);
  });
});
