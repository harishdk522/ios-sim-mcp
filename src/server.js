import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ActionableError } from "./robot.js";
import { SimctlManager } from "./iphone-simulator.js";
import { PNG } from "./png.js";
import { isImageMagickInstalled, Image } from "./image-utils.js";
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = "/Users/harish.dewangan/Documents/ios-demo/";

export const createMcpServer = () => {
  const server = new McpServer({
    name: "ios-sim-mcp",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  const tool = (name, description, paramsSchema, cb) => {
    const wrappedCb = async (args) => {
      try {
        console.log(`Invoking ${name} with args: ${JSON.stringify(args)}`);
        const response = await cb(args);
        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        if (error instanceof ActionableError) {
          return {
            content: [{ type: "text", text: `${error.message}. Please fix the issue and try again.` }],
          };
        } else {
          // a real exception
          console.log(`Tool '${description}' failed: ${error.message} stack: ${error.stack}`);
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
          };
        }
      }
    };

    server.tool(name, description, paramsSchema, args => wrappedCb(args));
  };

  let robot = null;
  const simulatorManager = new SimctlManager();

  const requireRobot = () => {
    if (!robot) {
      throw new ActionableError("No device selected. Use the mobile_use_device tool to select a device.");
    }
  };

  tool(
    "mobile_list_available_devices",
    "List all available devices.",
    {
      _unused: z.string().describe("This parameter is not used and can be ignored"),
    },
    async ({_unused}) => {
      try {
        const devices = simulatorManager.listBootedSimulators();
        const simulatorNames = devices.map(d => d.name);

        const resp = ["Found these devices:"];
        if (simulatorNames.length > 0) {
          resp.push(`iOS simulators: [${simulatorNames.join(".")}]`);
        }

        return resp.join("\n");
      } catch (err) {
        console.error(`Error listing available devices: ${err.message}`);
        throw err;
      }
    }
  );

  tool(
    "mobile_use_device",
    "Select a simulator to use.",
    {
      device: z.string().describe("The name of the simulator to select"),
      deviceType: z.enum(["simulator"]).describe("The type of device to select"),
    },
    async ({ device }) => {
      robot = simulatorManager.getSimulator(device);
      return `Selected device: ${device}`;
    }
  );

  tool(
    "mobile_list_apps",
    "List all the installed apps on the device.",
    {},
    async () => {
      requireRobot();
      const result = await robot.listApps();
      return `Found these apps on device: ${result.map(app => `${app.appName} (${app.packageName})`).join(", ")}`;
    }
  );

  tool(
    "mobile_launch_app",
    "Launch an app on mobile device. Use this to open a specific app.",
    {
      packageName: z.string().describe("The package name of the app to launch"),
    },
    async ({ packageName }) => {
      requireRobot();
      await robot.launchApp(packageName);
      return `Launched app ${packageName}`;
    }
  );

  tool(
    "mobile_terminate_app",
    "Stop and terminate an app on mobile device",
    {
      packageName: z.string().describe("The package name of the app to terminate"),
    },
    async ({ packageName }) => {
      requireRobot();
      await robot.terminateApp(packageName);
      return `Terminated app ${packageName}`;
    }
  );

  tool(
    "mobile_get_screen_size",
    "Get the screen size of the mobile device in pixels",
    {},
    async () => {
      requireRobot();
      const screenSize = await robot.getScreenSize();
      return `Screen size is ${screenSize.width}x${screenSize.height} pixels`;
    }
  );

  tool(
    "mobile_click_on_screen_at_coordinates",
    "Click on the screen at given x,y coordinates",
    {
      x: z.number().describe("The x coordinate to click on the screen, in pixels"),
      y: z.number().describe("The y coordinate to click on the screen, in pixels"),
    },
    async ({ x, y }) => {
      requireRobot();
      await robot.tap(x, y);
      return `Clicked on screen at coordinates: ${x}, ${y}`;
    }
  );

  tool(
    "mobile_list_elements_on_screen",
    "List elements on screen and their coordinates, with display text or accessibility label.",
    {},
    async () => {
      requireRobot();
      const elements = await robot.getElementsOnScreen();
      console.log("Elements on screen:", JSON.stringify(elements));
      // const result = elements.map(element => {
      //   const out = {
      //     ...element,
      //     coordinates: {
      //       x: element.rect.x,
      //       y: element.rect.y,
      //       width: element.rect.width,
      //       height: element.rect.height,
      //     },
      //   };

      //   return out;
      // });

      return `Found these elements on screen: ${JSON.stringify(elements)}`;
    }
  );

  tool(
    "mobile_press_button",
    "Press a button on device.",
    {
      button: z.string().describe("The button to press."),
    },
    async ({ button }) => {
      requireRobot();
      await robot.pressButton(button);
      return `Pressed the button: ${button}`;
    }
  );

  tool(
    "mobile_open_url",
    "Open a URL in browser on device",
    {
      url: z.string().describe("The URL to open"),
    },
    async ({ url }) => {
      requireRobot();
      await robot.openUrl(url);
      return `Opened URL: ${url}`;
    }
  );

  tool(
    "swipe_on_screen",
    "Swipe on the screen",
    {
      direction: z.enum(["up", "down"]).describe("The direction to swipe"),
    },
    async ({ direction }) => {
      requireRobot();
      await robot.swipe(direction);
      return `Swiped ${direction} on screen`;
    }
  );

  tool(
    "mobile_type_keys",
    "Type text into the focused element",
    {
      text: z.string().describe("The text to type"),
      submit: z.boolean().describe("Whether to submit the text. If true, the text will be submitted as if the user pressed the enter key."),
    },
    async ({ text, submit }) => {
      requireRobot();
      await robot.sendKeys(text);

      if (submit) {
        await robot.pressButton("ENTER");
      }

      return `Typed text: ${text}`;
    }
  );

  server.tool(
    "mobile_take_screenshot",
    "Take a screenshot of the mobile device.",
    {},
    async () => {
      requireRobot();

      try {
        const screenSize = await robot.getScreenSize();

        let screenshot = await robot.getScreenshot();
        let mimeType = "image/png";

        // validate we received a png, will throw exception otherwise
        const image = new PNG(screenshot);
        const pngSize = image.getDimensions();
        if (pngSize.width <= 0 || pngSize.height <= 0) {
          throw new ActionableError("Screenshot is invalid. Please try again.");
        }

        if (isImageMagickInstalled()) {
          const image = Image.fromBuffer(screenshot);
          screenshot = image.resize(Math.floor(pngSize.width / screenSize.scale))
            .jpeg({ quality: 75 })
            .toBuffer();
          mimeType = "image/jpeg";
        }

        // Create OUTPUT_DIR if it doesn't exist
        if (!fs.existsSync(OUTPUT_DIR)) {
          fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }

        // Generate a filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot-${timestamp}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);

        const screenshot64 = screenshot.toString("base64");
        console.log(`Screenshot taken: ${screenshot.length} bytes`);
        // Save the screenshot to disk
        fs.writeFileSync(filepath, screenshot);

        return {
          content: [
            { 
              type: "image", 
              data: screenshot64, 
              mimeType
            },
            {
              type: "text",
              text: `Screenshot saved to ${filepath}`,
            }
          ]
        };
      } catch (err) {
        console.error(`Error taking screenshot: ${err.message} ${err.stack}`);
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  tool(
    "mobile_set_orientation",
    "Change the screen orientation of the device",
    {
      orientation: z.enum(["portrait", "landscape"]).describe("The desired orientation"),
    },
    async ({ orientation }) => {
      requireRobot();
      await robot.setOrientation(orientation);
      return `Changed device orientation to ${orientation}`;
    }
  );

  tool(
    "mobile_get_orientation",
    "Get the current screen orientation of the device",
    {},
    async () => {
      requireRobot();
      const orientation = await robot.getOrientation();
      return `Current device orientation is ${orientation}`;
    }
  );

  return server;
};
