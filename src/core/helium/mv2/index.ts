export { Chrome } from './Chrome';
export * from './api';
export {
  ChromeEvent,
  DeclarativeEvent,
  ChromeSetting,
  ContentSetting,
  StorageArea,
  unpackExtension,
  parseCrx,
  unzip,
  parseManifest,
  deriveExtensionId,
} from '../shared';
export type {
  EventListener,
  Rule,
  RuleCallback,
  ExtensionFormat,
  ManifestVersion,
  ContentScriptRule,
  ActionDescriptor,
  BackgroundDescriptor,
  OptionsUiDescriptor,
  CommandDescriptor,
  SidePanelDescriptor,
  WebAccessibleResources,
  ContentSecurityPolicy,
  ChromeManifest,
  FirefoxManifest,
  UnpackedExtension,
  UnpackOptions,
} from '../shared';
