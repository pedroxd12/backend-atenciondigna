import { levelFromMinutes, haversineKm } from './saturation';

describe('saturation utilities', () => {
  describe('levelFromMinutes', () => {
    it('should return "bajo" for <= 10 min', () => {
      expect(levelFromMinutes(0)).toBe('bajo');
      expect(levelFromMinutes(5)).toBe('bajo');
      expect(levelFromMinutes(10)).toBe('bajo');
    });

    it('should return "medio" for 11-20 min', () => {
      expect(levelFromMinutes(11)).toBe('medio');
      expect(levelFromMinutes(15)).toBe('medio');
      expect(levelFromMinutes(20)).toBe('medio');
    });

    it('should return "alto" for 21-35 min', () => {
      expect(levelFromMinutes(21)).toBe('alto');
      expect(levelFromMinutes(28)).toBe('alto');
      expect(levelFromMinutes(35)).toBe('alto');
    });

    it('should return "critico" for > 35 min', () => {
      expect(levelFromMinutes(36)).toBe('critico');
      expect(levelFromMinutes(60)).toBe('critico');
      expect(levelFromMinutes(120)).toBe('critico');
    });
  });

  describe('haversineKm', () => {
    it('should return 0 for same coordinates', () => {
      expect(haversineKm(19.35, -99.17, 19.35, -99.17)).toBe(0);
    });

    it('should calculate distance between Coyoacan and Zocalo (~7km)', () => {
      // Coyoacan: 19.3568, -99.1716
      // Zocalo:   19.4326, -99.1332
      const dist = haversineKm(19.3568, -99.1716, 19.4326, -99.1332);
      expect(dist).toBeGreaterThan(5);
      expect(dist).toBeLessThan(12);
    });

    it('should be symmetric', () => {
      const d1 = haversineKm(19.35, -99.17, 19.43, -99.13);
      const d2 = haversineKm(19.43, -99.13, 19.35, -99.17);
      expect(d1).toBe(d2);
    });
  });
});
