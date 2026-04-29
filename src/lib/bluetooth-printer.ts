import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

// Common UUIDs for thermal printers
const PRINTER_SERVICE_UUID = numberToUUID(0x18F0); // Common printer service
const PRINTER_CHAR_UUID = numberToUUID(0x2AF1); // Common printer characteristic

// Alternative UUIDs for some printer brands
const PRINTER_SERVICE_UUID_ALT = "0000AE30-0000-1000-8000-00805F9B34FB";
const PRINTER_CHAR_UUID_ALT = "0000AE01-0000-1000-8000-00805F9B34FB";

export interface PrinterDevice {
  name: string;
  address: string;
  deviceId: string;
}

interface ConnectedDevice {
  deviceId: string;
  name: string;
}

let connectedDevice: ConnectedDevice | null = null;

/**
 * Initialize Bluetooth LE
 */
export async function initBluetooth(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log("Bluetooth LE only works on native platforms");
    return false;
  }

  try {
    await BleClient.initialize();
    console.log("Bluetooth LE initialized");
    return true;
  } catch (error) {
    console.error("Failed to initialize Bluetooth LE:", error);
    return false;
  }
}

/**
 * Request Bluetooth permissions
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    await BleClient.requestLEScan({}, (result) => {
      // Scan results handled elsewhere
    });
    await BleClient.stopLEScan();
    return true;
  } catch (error) {
    console.error("Failed to request Bluetooth permissions:", error);
    return false;
  }
}

/**
 * Scan for Bluetooth printers
 */
export async function scanForPrinters(timeoutMs: number = 10000): Promise<PrinterDevice[]> {
  if (!Capacitor.isNativePlatform()) {
    console.log("Bluetooth scan only works on native platforms");
    return [];
  }

  const devices: Map<string, PrinterDevice> = new Map();

  try {
    await BleClient.initialize();
    
    // Request permissions first
    try {
      await BleClient.requestLEScan({}, () => {});
      await BleClient.stopLEScan();
    } catch {
      // Permissions might already be granted, continue
    }

    // Scan without filtering by service UUID to find all devices
    await BleClient.requestLEScan(
      { 
        allowDuplicates: false,
        scanMode: 2 // SCAN_MODE_LOW_LATENCY for faster discovery
      },
      (result) => {
        const device = result.device;
        const deviceId = device.deviceId;
        
        // Filter for printer-like devices (name contains printer keywords or unknown)
        const name = device.name || "";
        const isPrinter = 
          name.toLowerCase().includes("printer") ||
          name.toLowerCase().includes("pos") ||
          name.toLowerCase().includes("thermal") ||
          name.toLowerCase().includes("bt") ||
          name.length > 0; // Include all named devices
        
        if (!devices.has(deviceId) && isPrinter) {
          devices.set(deviceId, {
            name: device.name || `Printer ${deviceId.slice(-6)}`,
            address: deviceId,
            deviceId: deviceId,
          });
        }
      }
    );

    // Wait for scan duration
    await new Promise(resolve => setTimeout(resolve, timeoutMs));
    
    await BleClient.stopLEScan();
    
    return Array.from(devices.values());
  } catch (error) {
    console.error("Failed to scan for printers:", error);
    await BleClient.stopLEScan().catch(() => {});
    return [];
  }
}

/**
 * Connect to a Bluetooth printer
 */
export async function connectToPrinter(deviceId: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    // Check if already connected
    if (connectedDevice && connectedDevice.deviceId === deviceId) {
      console.log(`Already connected to ${deviceId}`);
      return true;
    }

    // Disconnect from previous device if any
    if (connectedDevice) {
      try {
        await BleClient.disconnect(connectedDevice.deviceId);
      } catch (e) {
        // Ignore disconnect errors
      }
      connectedDevice = null;
    }

    await BleClient.connect(deviceId, (deviceId) => {
      console.log(`Disconnected from ${deviceId}`);
      connectedDevice = null;
    });

    connectedDevice = { deviceId, name: "" };
    console.log(`Connected to printer: ${deviceId}`);
    return true;
  } catch (error) {
    console.error("Failed to connect to printer:", error);
    return false;
  }
}

/**
 * Auto-connect to saved printer on app start
 * Call this when app loads with saved bluetoothAddress
 */
export async function autoConnectToPrinter(deviceId: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (!deviceId) return false;

  // Already connected to this device
  if (connectedDevice && connectedDevice.deviceId === deviceId) {
    return true;
  }

  console.log(`Auto-connecting to saved printer: ${deviceId}`);
  return connectToPrinter(deviceId);
}

/**
 * Disconnect from current printer
 */
export async function disconnectPrinter(): Promise<void> {
  if (!connectedDevice) return;
  
  try {
    await BleClient.disconnect(connectedDevice.deviceId);
    connectedDevice = null;
  } catch (error) {
    console.error("Failed to disconnect:", error);
  }
}

/**
 * Check if printer is connected
 */
export function isPrinterConnected(): boolean {
  return connectedDevice !== null;
}

/**
 * Get connected printer info
 */
export function getConnectedPrinter(): PrinterDevice | null {
  if (!connectedDevice) return null;
  
  return {
    name: connectedDevice.name || "Connected Printer",
    address: connectedDevice.deviceId,
    deviceId: connectedDevice.deviceId,
  };
}

/**
 * Send raw bytes to printer
 */
async function sendRaw(data: Uint8Array, deviceId?: string): Promise<boolean> {
  const targetDevice = deviceId || connectedDevice?.deviceId;
  if (!targetDevice) {
    console.error("No printer connected");
    return false;
  }

  // Convert Uint8Array to DataView for BLE write
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

  try {
    // Try primary UUID first
    try {
      await BleClient.write(targetDevice, PRINTER_SERVICE_UUID, PRINTER_CHAR_UUID, dataView);
      return true;
    } catch {
      // Try alternative UUID
      await BleClient.write(targetDevice, PRINTER_SERVICE_UUID_ALT, PRINTER_CHAR_UUID_ALT, dataView);
      return true;
    }
  } catch (error) {
    console.error("Failed to send data to printer:", error);
    return false;
  }
}

// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

/**
 * Initialize printer
 */
export async function initPrinter(): Promise<boolean> {
  const cmd = new Uint8Array([ESC, 0x40]); // ESC @
  return sendRaw(cmd);
}

/**
 * Print text
 */
export async function printText(text: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  const cmd = new Uint8Array(textBytes.length + 1);
  cmd.set(textBytes);
  cmd[textBytes.length] = LF;
  return sendRaw(cmd);
}

/**
 * Set text alignment (0=left, 1=center, 2=right)
 */
export async function setAlignment(align: 0 | 1 | 2): Promise<boolean> {
  const cmd = new Uint8Array([ESC, 0x61, align]);
  return sendRaw(cmd);
}

/**
 * Set text size (0=normal, 1=double height, 2=double width, 3=double both)
 */
export async function setTextSize(size: 0 | 1 | 2 | 3): Promise<boolean> {
  const cmd = new Uint8Array([GS, 0x21, size]);
  return sendRaw(cmd);
}

/**
 * Bold on/off
 */
export async function setBold(enabled: boolean): Promise<boolean> {
  const cmd = new Uint8Array([ESC, 0x45, enabled ? 1 : 0]);
  return sendRaw(cmd);
}

/**
 * Underline on/off
 */
export async function setUnderline(enabled: boolean): Promise<boolean> {
  const cmd = new Uint8Array([ESC, 0x2D, enabled ? 1 : 0]);
  return sendRaw(cmd);
}

/**
 * Print line feed (blank lines)
 */
export async function lineFeed(lines: number = 3): Promise<boolean> {
  const cmd = new Uint8Array([ESC, 0x64, lines]);
  return sendRaw(cmd);
}

/**
 * Set line spacing (n = 0-255, default is 30)
 * ESC 3 n - Set line spacing to n/216 inches
 */
export async function setLineSpacing(spacing: number = 30): Promise<boolean> {
  const cmd = new Uint8Array([ESC, 0x33, spacing]);
  return sendRaw(cmd);
}

/**
 * Set default line spacing
 * ESC 2 - Reset to default line spacing
 */
export async function setDefaultLineSpacing(): Promise<boolean> {
  const cmd = new Uint8Array([ESC, 0x32]);
  return sendRaw(cmd);
}

/**
 * Cut paper (partial cut)
 */
export async function cutPaper(): Promise<boolean> {
  const cmd = new Uint8Array([GS, 0x56, 0x01]);
  return sendRaw(cmd);
}

/**
 * Send raw ESC/POS string to printer
 * Converts string with escape sequences to bytes and sends to printer
 * Splits data into chunks for Bluetooth LE (MTU limit ~20-512 bytes)
 */
export async function sendEscPosString(data: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  
  // Split into chunks of 100 bytes to stay under typical BLE MTU
  const CHUNK_SIZE = 100;
  const chunks: Uint8Array[] = [];
  
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    chunks.push(chunk);
  }
  
  // Send each chunk with small delay
  for (const chunk of chunks) {
    const success = await sendRaw(chunk);
    if (!success) {
      console.error("Failed to send chunk");
      return false;
    }
    // Small delay between chunks to prevent buffer overflow
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  return true;
}
