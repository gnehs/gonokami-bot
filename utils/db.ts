import fs from "fs";
import path from "path";

const dataDir = "./data";

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

class JsonFileDb<T extends Record<string, unknown> = Record<string, unknown>> {
  private filePath: string;
  private _data: T;

  constructor(fileName: string) {
    this.filePath = path.join(dataDir, fileName);
    this._data = {} as T;
    this._readData();
  }

  private _readData(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const jsonString = fs.readFileSync(this.filePath, "utf8");
        this._data = JSON.parse(jsonString);
      } else {
        this._data = {} as T;
      }
    } catch (e) {
      console.error(`Error reading or parsing ${this.filePath}`, e);
      this._data = {} as T;
    }
  }

  private _writeData(): void {
    const tempFilePath = this.filePath + ".tmp";
    try {
      fs.writeFileSync(tempFilePath, JSON.stringify(this._data), "utf8");
      fs.renameSync(tempFilePath, this.filePath);
    } catch (e) {
      console.error(`Error writing to ${this.filePath}`, e);
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e2) {
          console.error(`Error removing temp file ${tempFilePath}`, e2);
        }
      }
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    this._readData();
    return this._data[key];
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this._data[key] = value;
    this._writeData();
  }

  has(key: keyof T): boolean {
    this._readData();
    return key in this._data;
  }

  delete(key: keyof T): boolean {
    this._readData();
    if (key in this._data) {
      delete this._data[key];
      this._writeData();
      return true;
    }
    return false;
  }

  all(): T {
    this._readData();
    return this._data;
  }
}

export default JsonFileDb;
