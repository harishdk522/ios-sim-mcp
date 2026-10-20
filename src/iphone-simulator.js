import { execFileSync } from "child_process";

import { WebDriverAgent } from "./webdriver-agent.js";
import { ActionableError, ORIENTATIONS, SWIPE_DIRECTIONS, BUTTONS } from "./robot.js";

const TIMEOUT = 30000;
const WDA_PORT = 8100;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;

export class Simctl {
  constructor(simulatorUuid) {
    this.simulatorUuid = simulatorUuid;
  }

  async wda() {
    const wda = new WebDriverAgent("localhost", WDA_PORT);

    if (!(await wda.isRunning())) {
      throw new ActionableError("WebDriverAgent is not running on simulator");
    }

    return wda;
  }

  simctl(...args) {
    return execFileSync("xcrun", ["simctl", ...args], {
      timeout: TIMEOUT,
      maxBuffer: MAX_BUFFER_SIZE,
    });
  }

  async getScreenshot() {
    return this.simctl("io", this.simulatorUuid, "screenshot", "-");
  }

  async openUrl(url) {
    const wda = await this.wda();
    await wda.openUrl(url);
    // alternative: this.simctl("openurl", this.simulatorUuid, url);
  }

  async launchApp(packageName) {
    this.simctl("launch", this.simulatorUuid, packageName);
  }

  async terminateApp(packageName) {
    this.simctl("terminate", this.simulatorUuid, packageName);
  }

  static parseIOSAppData(inputText) {
    const result = [];

    // Define parse states as constants
    const PARSE_STATE = {
      LOOKING_FOR_APP: 0,
      IN_APP: 1,
      IN_PROPERTY: 2
    };

    let state = PARSE_STATE.LOOKING_FOR_APP;
    let currentApp = {};
    let appIdentifier = "";

    const lines = inputText.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (line === "") {
        continue;
      }

      switch (state) {
        case PARSE_STATE.LOOKING_FOR_APP:
          // look for app identifier pattern: "com.example.app" = {
          const appMatch = line.match(/^"?([^"=]+)"?\\s*=\\s*\\{/);
          if (appMatch) {
            appIdentifier = appMatch[1].trim();
            currentApp = {
              CFBundleIdentifier: appIdentifier,
            };

            state = PARSE_STATE.IN_APP;
          }
          break;

        case PARSE_STATE.IN_APP:
          if (line === "};") {
            result.push(currentApp);
            currentApp = {};
            state = PARSE_STATE.LOOKING_FOR_APP;
          } else {
            // look for property: PropertyName = Value;
            const propertyMatch = line.match(/^([^=]+)\\s*=\\s*(.+?);\\s*$/);
            if (propertyMatch) {
              const propName = propertyMatch[1].trim();
              let propValue = propertyMatch[2].trim();

              // remove quotes if present (they're optional)
              if (propValue.startsWith('"') && propValue.endsWith('"')) {
                propValue = propValue.substring(1, propValue.length - 1);
              }

              // add property to current app
              currentApp[propName] = propValue;
            } else if (line.endsWith("{")) {
              // nested property like GroupContainers = {
              state = PARSE_STATE.IN_PROPERTY;
            }
          }
          break;

        case PARSE_STATE.IN_PROPERTY:
          if (line === "};") {
            // end of nested property
            state = PARSE_STATE.IN_APP;
          }

          // skip content of nested properties, we don't care of those right now
          break;
      }
    }

    return result;
  }

  async listApps() {
    const text = this.simctl("listapps", this.simulatorUuid).toString();
    const apps = Simctl.parseIOSAppData(text);
    return apps.map(app => ({
      packageName: app.CFBundleIdentifier,
      appName: app.CFBundleDisplayName,
    }));
  }

  async getScreenSize() {
    const wda = await this.wda();
    return wda.getScreenSize();
  }

  async sendKeys(keys) {
    const wda = await this.wda();
    return wda.sendKeys(keys);
  }

  async swipe(direction) {
    const wda = await this.wda();
    return wda.swipe(direction);
  }

  async tap(x, y) {
    const wda = await this.wda();
    return wda.tap(x, y);
  }

  async pressButton(button) {
    const wda = await this.wda();
    return wda.pressButton(button);
  }

  async getElementsOnScreen() {
    const wda = await this.wda();
    return wda.getElementsOnScreen();
  }

  async setOrientation(orientation) {
    const wda = await this.wda();
    return wda.setOrientation(orientation);
  }

  async getOrientation() {
    const wda = await this.wda();
    return wda.getOrientation();
  }
}

export class SimctlManager {
  listSimulators() {
    // detect if this is a mac
    if (process.platform !== "darwin") {
      // don't even try to run xcrun
      return [];
    }

    try {
      const text = execFileSync("xcrun", ["simctl", "list", "devices", "-j"]).toString();
      const json = JSON.parse(text);
      return Object.values(json.devices).flatMap(device => {
        return device.map(d => {
          return {
            name: d.name,
            uuid: d.udid,
            state: d.state,
          };
        });
      });
    } catch (error) {
      console.error("Error listing simulators", error);
      return [];
    }
  }

  listBootedSimulators() {
    return this.listSimulators()
      .filter(simulator => simulator.state === "Booted");
  }

  getSimulator(uuid) {
    return new Simctl(uuid);
  }
}
