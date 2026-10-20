import { ActionableError, SWIPE_DIRECTIONS } from "./robot.js";

export class WebDriverAgent {
  constructor(host, port) {
    this.host = host;
    this.port = port;
  }

  async isRunning() {
    const url = `http://${this.host}:${this.port}/status`;
    try {
      const response = await fetch(url);
      return response.status === 200;
    } catch (error) {
      console.error(`Failed to connect to WebDriverAgent: ${error}`);
      return false;
    }
  }

  async createSession() {
    const url = `http://${this.host}:${this.port}/session`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ capabilities: { alwaysMatch: { platformName: "iOS" } } }),
    });

    const json = await response.json();
    return json.value.sessionId;
  }

  async deleteSession(sessionId) {
    const url = `http://${this.host}:${this.port}/session/${sessionId}`;
    const response = await fetch(url, { method: "DELETE" });
    return response.json();
  }

  async withinSession(fn) {
    const sessionId = await this.createSession();
    const url = `http://${this.host}:${this.port}/session/${sessionId}`;
    const result = await fn(url);
    await this.deleteSession(sessionId);
    return result;
  }

  async getScreenSize() {
    return this.withinSession(async sessionUrl => {
      const url = `${sessionUrl}/wda/screen`;
      const response = await fetch(url);
      const json = await response.json();
      return {
        width: json.value.screenSize.width,
        height: json.value.screenSize.height,
        scale: json.value.scale || 1,
      };
    });
  }

  async sendKeys(keys) {
    await this.withinSession(async sessionUrl => {
      const url = `${sessionUrl}/wda/keys`;
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: [keys] }),
      });
    });
  }

  async pressButton(button) {
    const _map = {
      "HOME": "home",
      "VOLUME_UP": "volumeup",
      "VOLUME_DOWN": "volumedown",
    };

    if (button === "ENTER") {
      await this.sendKeys("\n");
      return;
    }

    if (!(button in _map)) {
      throw new ActionableError(`Button "${button}" is not supported`);
    }

    await this.withinSession(async sessionUrl => {
      const url = `${sessionUrl}/wda/pressButton`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: button,
        }),
      });

      return response.json();
    });
  }

  async tap(x, y) {
    await this.withinSession(async sessionUrl => {
      const url = `${sessionUrl}/actions`;
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actions: [
            {
              type: "pointer",
              id: "finger1",
              parameters: { pointerType: "touch" },
              actions: [
                { type: "pointerMove", duration: 0, x, y },
                { type: "pointerDown", button: 0 },
                { type: "pause", duration: 100 },
                { type: "pointerUp", button: 0 }
              ]
            }
          ]
        }),
      });
    });
  }

  isVisible(rect) {
    return rect.x >= 0 && rect.y >= 0;
  }

  async filterSourceElements(source) {
    const output = [];

    const acceptedTypes = ["TextField", "Button", "Switch", "Icon", "SearchField", "StaticText", "Image", "WebView", "WebViewElement", "WebViewElementContainer"];

    if (acceptedTypes.includes(source.type)) {
      if (source.isVisible === "1" && this.isVisible(source.rect)) {
        if (source.label !== null || source.name !== null || source.rawIdentifier !== null) {
          const elementId = await this.findElement("accessibility id", source.rawIdentifier);
          const attributes = elementId ? await this.getElementAttributes(elementId) : {};
          output.push({
            ...attributes,
            ...source,
            elementId
          });
        }
      }
    }

    if (source.children) {
      for (const child of source.children) {
        output.push(...await this.filterSourceElements(child));
      }
    }

    return output;
  }

  async findElement(using, value) {
    return this.withinSession(async sessionUrl => {
      const url = `${sessionUrl}/element`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ using, value }),
      });
      const json = await response.json();
      return json.value?.ELEMENT;
    });
  }

  async getPageSource() {
    const url = `http://${this.host}:${this.port}/source/?format=json`;
    const response = await fetch(url);
    const json = await response.json();
    return json;
  }

  async getElementAttributes(elementId) {
    return this.withinSession(async sessionUrl => {
      const url = `${sessionUrl}/element/${elementId}/attribute/all`;
      const response = await fetch(url);
      return (await response.json()).value;
    });
  }

  async getElementsOnScreen() {
    const source = await this.getPageSource();
    return await this.filterSourceElements(source.value);
  }

  async openUrl(url) {
    await this.withinSession(async sessionUrl => {
      await fetch(`${sessionUrl}/url`, {
        method: "POST",
        body: JSON.stringify({ url }),
      });
    });
  }

  async swipe(direction) {
    await this.withinSession(async sessionUrl => {
      const x0 = 200;
      let y0 = 600;
      const x1 = 200;
      let y1 = 200;

      if (direction === SWIPE_DIRECTIONS.UP) {
        const tmp = y0;
        y0 = y1;
        y1 = tmp;
      }

      const url = `${sessionUrl}/actions`;
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actions: [
            {
              type: "pointer",
              id: "finger1",
              parameters: { pointerType: "touch" },
              actions: [
                { type: "pointerMove", duration: 0, x: x0, y: y0 },
                { type: "pointerDown", button: 0 },
                { type: "pointerMove", duration: 0, x: x1, y: y1 },
                { type: "pause", duration: 1000 },
                { type: "pointerUp", button: 0 }
              ]
            }
          ]
        }),
      });
    });
  }

  async setOrientation(orientation) {
    await this.withinSession(async sessionUrl => {
      const url = `${sessionUrl}/orientation`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orientation: orientation.toUpperCase()
        })
      });
    });
  }

  async getOrientation() {
    return this.withinSession(async sessionUrl => {
      const url = `${sessionUrl}/orientation`;
      const response = await fetch(url);
      const json = await response.json();
      return json.value.toLowerCase();
    });
  }
}
