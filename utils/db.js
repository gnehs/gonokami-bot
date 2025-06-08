import fs from "fs";
import path from "path";

const dataDir = "./data";

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

class JsonFileDb {
  constructor(fileName) {
    this.filePath = path.join(dataDir, fileName);
    this._data = {};
    this._readData();
  }

  _readData() {
    try {
      if (fs.existsSync(this.filePath)) {
        const jsonString = fs.readFileSync(this.filePath, "utf8");
        this._data = JSON.parse(jsonString);
      } else {
        this._data = {};
      }
    } catch (e) {
      console.error(`Error reading or parsing ${this.filePath}`, e);
      this._data = {};
    }
  }

  _writeData() {
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

  get(key) {
    this._readData(); // always get fresh data
    return this._data[key];
  }

  set(key, value) {
    this._data[key] = value;
    this._writeData();
  }

  has(key) {
    this._readData(); // always get fresh data
    return key in this._data;
  }

  delete(key) {
    this._readData();
    if (key in this._data) {
      delete this._data[key];
      this._writeData();
      return true;
    }
    return false;
  }

  all() {
    this._readData(); // always get fresh data
    return this._data;
  }
}

export default JsonFileDb;
