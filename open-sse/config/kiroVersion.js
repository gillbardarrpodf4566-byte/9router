// Kiro upstream gates requests on the client identity carried in the
// User-Agent pair: it must match the AWS SDK "ua/" chain the Kiro IDE sends
// (`KiroIDE-<version>-<machineId>`), or the gateway answers 400 "This version
// of Kiro is no longer supported". Keep KIRO_IDE_VERSION synced to a current
// Kiro IDE release (see also services/kiroModels.js, which owns the full
// per-account fingerprint headers used on the chat path).
export const KIRO_RUNTIME_SDK_VERSION = "1.0.0";
export const KIRO_IDE_VERSION = "1.0.740";
export const KIRO_IDE_FALLBACK_MACHINE_ID = "9router-fallback";
export const KIRO_USER_AGENT =
  `aws-sdk-js/${KIRO_RUNTIME_SDK_VERSION} ua/2.1 ` +
  `os/windows#10.0.26200 lang/js md/nodejs#22.21.1 ` +
  `api/codewhispererruntime#${KIRO_RUNTIME_SDK_VERSION} m/N,E ` +
  `KiroIDE-${KIRO_IDE_VERSION}-${KIRO_IDE_FALLBACK_MACHINE_ID}`;
export const KIRO_AMZ_USER_AGENT =
  `aws-sdk-js/${KIRO_RUNTIME_SDK_VERSION} KiroIDE-${KIRO_IDE_VERSION}-${KIRO_IDE_FALLBACK_MACHINE_ID}`;
