/**
 * Error class for actionable errors
 */
export class ActionableError extends Error {
  constructor(message) {
    super(message);
  }
}

// Export constants for valid orientations and directions
export const ORIENTATIONS = {
  PORTRAIT: "portrait",
  LANDSCAPE: "landscape"
};

export const BUTTONS = {
  HOME: "HOME",
  VOLUME_UP: "VOLUME_UP",
  VOLUME_DOWN: "VOLUME_DOWN",
  ENTER: "ENTER"
};

export const SWIPE_DIRECTIONS = {
  UP: "up",
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right"
};

/**
 * The Robot interface defines the contract for device control.
 * This is implemented by different device controllers.
 * 
 * In JavaScript, this serves as documentation for required methods.
 */

/*
 * Robot Interface Methods:
 * 
 * getScreenSize() - Get the screen size of the device in pixels.
 * swipe(direction) - Swipe in a direction.
 * getScreenshot() - Get a screenshot of the screen.
 * listApps() - List all installed apps on the device.
 * launchApp(packageName) - Launch an app.
 * terminateApp(packageName) - Terminate an app.
 * openUrl(url) - Open a URL in the device's web browser.
 * sendKeys(text) - Send keys to the device, simulating keyboard input.
 * pressButton(button) - Press a button on the device.
 * tap(x, y) - Tap on a specific coordinate on the screen.
 * getElementsOnScreen() - Get all elements on the screen.
 * setOrientation(orientation) - Change the screen orientation of the device.
 * getOrientation() - Get the current screen orientation.
 */
