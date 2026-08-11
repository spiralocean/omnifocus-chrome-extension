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

        guard let dict = message as? [String: Any] else {
            complete(context, with: ["ok": false, "error": "Invalid message."])
            return
        }

        let action = (dict["action"] as? String) ?? "open"

        if action == "reveal-task" {
            handleRevealTask(dict, context: context)
            return
        }

        handleOpen(dict, context: context)
    }

    private func handleOpen(_ dict: [String: Any], context: NSExtensionContext) {
        guard let urlString = dict["url"] as? String,
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

    private func handleRevealTask(_ dict: [String: Any], context: NSExtensionContext) {
        guard let name = dict["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            complete(context, with: ["ok": false, "error": "Missing task name."])
            return
        }

        #if os(macOS)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let result = self?.revealTask(named: name) ?? ["ok": false, "error": "Reveal unavailable."]
            os_log("reveal-task result: %{public}@", log: nativeLog, type: .default, String(describing: result))
            DispatchQueue.main.async {
                self?.complete(context, with: result)
            }
        }
        #else
        complete(context, with: ["ok": false, "error": "Clip to OmniFocus requires macOS."])
        #endif
    }

    #if os(macOS)
    /// Look up the newest OmniFocus task with this name and open its task URL.
    private func revealTask(named name: String) -> [String: Any] {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let taskId = findTaskId(named: trimmed), !taskId.isEmpty else {
            return ["ok": false, "error": "Task not found."]
        }

        guard let url = URL(string: "omnifocus:///task/\(taskId)") else {
            return ["ok": false, "error": "Invalid task URL."]
        }

        // Notification clicks always want OmniFocus in front with the task selected.
        let semaphore = DispatchSemaphore(value: 0)
        var openResult: [String: Any] = ["ok": false, "error": "Open timed out."]
        open(url: url, activate: true) { result in
            openResult = result
            semaphore.signal()
        }
        _ = semaphore.wait(timeout: .now() + 8)
        return openResult
    }

    private func findTaskId(named name: String) -> String? {
        let escaped = name
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")

        let source = """
        tell application "OmniFocus"
          tell default document
            set matches to flattened tasks whose name is "\(escaped)"
            if (count of matches) is 0 then return ""
            set best to item 1 of matches
            set bestDate to creation date of best
            repeat with t in matches
              if creation date of t comes after bestDate then
                set best to t
                set bestDate to creation date of t
              end if
            end repeat
            return id of best as string
          end tell
        end tell
        """

        var error: NSDictionary?
        guard let script = NSAppleScript(source: source) else { return nil }
        let output = script.executeAndReturnError(&error)
        if error != nil { return nil }
        let taskId = output.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return taskId.isEmpty ? nil : taskId
    }

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
