// Kiro upstream rejects clients below its minimum supported version with
// 400 "This version of Kiro is no longer supported". Keep this synced to a
// current Kiro IDE release (https://kiro.dev/changelog).
export const KIRO_IDE_VERSION = "1.4.154";
export const KIRO_USER_AGENT = `AWS-SDK-JS/3.0.0 kiro-ide/${KIRO_IDE_VERSION}`;
export const KIRO_AMZ_USER_AGENT = `aws-sdk-js/3.0.0 kiro-ide/${KIRO_IDE_VERSION}`;
