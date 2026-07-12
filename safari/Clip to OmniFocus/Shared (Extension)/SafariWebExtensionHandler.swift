//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Stephen Zinn on 6/23/26.
//

import SafariServices
import os.log

#if os(macOS)
import AppKit
#endif

private let nativeLog = OSLog(subsystem: "com.spiralocean.cliptoomnifocus", category: "native")

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log("native request: %{public}@", log: nativeLog, type: .default, String(describing: message))

        guard let dict = message as? [String: Any],
              let urlString = dict["url"] as? String,
              urlString.hasPrefix("omnifocus://"),
              let url = URL(string: urlString) else {
            complete(context, with: ["ok": false, "error": "Refused non-OmniFocus URL."])
            return
        }

        // `activate` mirrors the "Switch to OmniFocus after clipping" setting.
        // When false we open in the background, so Safari keeps focus.
        let activate = (dict["activate"] as? Bool) ?? false
        open(url: url, activate: activate) { [weak self] result in
            os_log("open result: %{public}@", log: nativeLog, type: .default, String(describing: result))
            self?.complete(context, with: result)
        }
    }

    #if os(macOS)
    private func open(url: URL, activate: Bool, completion: @escaping ([String: Any]) -> Void) {
        if #available(macOS 10.15, *) {
            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = activate
            NSWorkspace.shared.open(url, configuration: configuration) { _, error in
                if let error = error {
                    completion(["ok": false, "error": error.localizedDescription])
                } else {
                    completion(["ok": true])
                }
            }
        } else {
            // Pre-Catalina can't open in the background; Safari web extensions
            // don't run on these releases anyway, so this only satisfies the compiler.
            let ok = NSWorkspace.shared.open(url)
            completion(ok ? ["ok": true] : ["ok": false, "error": "Could not open OmniFocus."])
        }
    }
    #else
    private func open(url: URL, activate: Bool, completion: @escaping ([String: Any]) -> Void) {
        completion(["ok": false, "error": "Clip to OmniFocus requires macOS."])
    }
    #endif

    private func complete(_ context: NSExtensionContext, with result: [String: Any]) {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: result]
        } else {
            response.userInfo = ["message": result]
        }
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

}
