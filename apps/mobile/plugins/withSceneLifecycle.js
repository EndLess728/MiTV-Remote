/**
 * Adopts the UIScene app lifecycle on iOS.
 *
 * Apps built with the iOS 27 SDK must use scenes: UIKit stops an app at launch with
 * `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` otherwise. Expo SDK 57's
 * AppDelegate template still creates its window in `didFinishLaunching`, so this plugin:
 *
 *   1. declares a scene configuration in Info.plist,
 *   2. adds SceneDelegate.swift, which creates the window from its UIWindowScene and starts
 *      React Native in it, and
 *   3. removes the window setup from AppDelegate.swift.
 *
 * It fails the prebuild instead of guessing if the AppDelegate template changes shape.
 */
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('@expo/config-plugins');

const SCENE_DELEGATE = `import React
import UIKit

/// Owns the app's window. AppDelegate creates the React Native factory; this starts it in a
/// window attached to the scene UIKit hands us (see plugins/withSceneLifecycle.js).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Some libraries still read the window from the app delegate.
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
  }
}
`;

const WINDOW_SETUP =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\([\s\S]*?\)\s*#endif\s*/;

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

const withAppDelegateWithoutWindow = (config) =>
  withAppDelegate(config, (cfg) => {
    const { contents, language } = cfg.modResults;
    if (language !== 'swift') {
      throw new Error('withSceneLifecycle: expected a Swift AppDelegate.');
    }
    if (contents.includes('SceneDelegate starts React Native')) return cfg;
    if (!WINDOW_SETUP.test(contents)) {
      throw new Error(
        'withSceneLifecycle: AppDelegate.swift no longer matches the expected template; update the plugin.',
      );
    }
    cfg.modResults.contents = contents.replace(
      WINDOW_SETUP,
      "    // SceneDelegate starts React Native in the scene's window (UIScene lifecycle).\n\n    ",
    );
    return cfg;
  });

const withSceneDelegateFile = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      const file = path.join(
        cfg.modRequest.platformProjectRoot,
        projectName,
        'SceneDelegate.swift',
      );
      fs.writeFileSync(file, SCENE_DELEGATE);
      return cfg;
    },
  ]);

const withSceneDelegateInProject = (config) =>
  withXcodeProject(config, (cfg) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filepath = `${projectName}/SceneDelegate.swift`;
    if (!cfg.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: cfg.modResults,
      });
    }
    return cfg;
  });

module.exports = (config) =>
  withSceneDelegateInProject(
    withSceneDelegateFile(withAppDelegateWithoutWindow(withSceneManifest(config))),
  );
