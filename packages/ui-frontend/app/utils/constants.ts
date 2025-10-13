export const WORK_DIR_NAME = 'project';
export const WORK_DIR = `/home/${WORK_DIR_NAME}`;
export const MODIFICATIONS_TAG_NAME = 'eitherway_file_modifications';

/**
 * WebContainer and Preview Configuration Constants
 */

/**
 * Timeout to wait for preview registration after server starts (milliseconds)
 * Allows time for WebContainer port events to fire before attempting manual registration
 */
export const PREVIEW_REGISTRATION_TIMEOUT_MS = 3000;

/**
 * Default port for WebContainer dev server and static server
 */
export const WEBCONTAINER_DEFAULT_PORT = 3000;
