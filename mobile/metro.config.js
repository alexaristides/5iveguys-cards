// The app reuses the website's pure-TypeScript game logic from ../lib
// (match engine, formations, card data). Metro needs to watch that folder, and
// package imports inside it (e.g. seedrandom) must resolve from this project.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const sharedDir = path.resolve(projectRoot, "../lib");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders ?? []), sharedDir];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@shared/")) {
    return context.resolveRequest(context, path.join(sharedDir, moduleName.slice("@shared/".length)), platform);
  }
  if (context.originModulePath.startsWith(sharedDir + path.sep) && !moduleName.startsWith(".")) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, "package.json") },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
