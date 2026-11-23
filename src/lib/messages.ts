/** Kind, plain messages shown when something can't be saved or read (never raw technical error text). */

/** A save that still failed after the database reconnect-and-retry. What was typed always stays on screen. */
export const SAVE_FAILED = "That didn't save. Your writing is still here, tap Save to try again.";

/** Reading from this device failed even after retrying. */
export const READ_FAILED = "Couldn't open this on this device just now. Please go back and try again in a moment.";
