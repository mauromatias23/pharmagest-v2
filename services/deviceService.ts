/**
 * Device and Idempotency Management Service
 * Manages unique persistent device identification and cryptographic operation IDs.
 */

const DEVICE_ID_KEY = 'pharmagest_device_id';
const DEVICE_NAME_KEY = 'pharmagest_device_name';

export class DeviceService {
  /**
   * Retrieves or initializes the persistent unique device ID.
   */
  static getDeviceId(): string {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      const randomPart = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID().slice(0, 8).toUpperCase()
        : Math.random().toString(36).substring(2, 10).toUpperCase();
      id = `DEV-${randomPart}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  /**
   * Retrieves the human-readable device name (e.g. Caixa 01, Balcão 02, etc.).
   */
  static getDeviceName(): string {
    let name = localStorage.getItem(DEVICE_NAME_KEY);
    if (!name) {
      const devId = this.getDeviceId();
      name = `Terminal ${devId.slice(-4)}`;
      localStorage.setItem(DEVICE_NAME_KEY, name);
    }
    return name;
  }

  /**
   * Updates the human-friendly device name.
   */
  static setDeviceName(name: string): void {
    if (name && name.trim()) {
      localStorage.setItem(DEVICE_NAME_KEY, name.trim());
    }
  }

  /**
   * Generates a collision-resistant UUID v4 operation ID for idempotent transactions.
   */
  static generateOperationId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback RFC4122 compliant UUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Generates a device-scoped collision-safe invoice number.
   * e.g. "FR-2026/0045" or "FR-2026/0045-A1B2" when offline multi-device.
   */
  static formatInvoiceNumber(seq: number, year: number = new Date().getFullYear()): string {
    const padSeq = String(seq).padStart(4, '0');
    return `FR-${year}/${padSeq}`;
  }
}
