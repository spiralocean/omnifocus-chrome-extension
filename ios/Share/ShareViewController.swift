import UIKit
import Social
import UniformTypeIdentifiers

/// The Share Sheet compose UI. Invoked from Safari (rich web-page data via the
/// JS preprocessing file) or from native apps like X (URL / text only).
@objc(ShareViewController)
class ShareViewController: SLComposeServiceViewController {

    private var pageURL = ""
    private var pageTitle = ""
    private var selection = ""
    private var excerpt = ""
    private var didPrefill = false

    override func presentationAnimationDidFinish() {
        super.presentationAnimationDidFinish()
        placeholder = "Task name"
        loadSharedContent()
    }

    // The compose text view holds the (editable) task name; always allow posting.
    override func isContentValid() -> Bool { true }

    override func didSelectPost() {
        let typed = (contentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let name = typed.isEmpty ? OmniFocusURL.suggestedName(title: pageTitle, url: pageURL) : typed
        let note = OmniFocusURL.formatClipNote(title: pageTitle, url: pageURL, excerpt: excerpt, selection: selection)

        guard let url = OmniFocusURL.buildAddURL(name: name, note: note, autosave: true) else {
            NSLog("[ClipToOmniFocus] failed to build OmniFocus URL")
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }

        NSLog("[ClipToOmniFocus] queuing: %@", url.absoluteString)
        // A Share extension can't open omnifocus:// itself, so queue the clip in
        // the shared App Group and wake the containing app, which opens it.
        ClipStore.enqueue(url.absoluteString)
        ClipStore.logEvent("ext: enqueued clip")
        completeWithHandoff()
    }

    /// Ask the system to launch our containing app (which flushes the queue into
    /// OmniFocus), then finish. The clip is already safely queued, so we complete
    /// regardless of whether the launch is granted.
    private func completeWithHandoff() {
        guard let handoff = ClipStore.handoffURL else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }
        extensionContext?.open(handoff) { [weak self] ok in
            ClipStore.logEvent("ext: handoff open ok=\(ok)")
            DispatchQueue.main.async {
                self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            }
        }
    }

    override func configurationItems() -> [Any]! { [] }

    // MARK: - Input loading

    private func loadSharedContent() {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        for item in items {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier) {
                    load(provider, UTType.propertyList.identifier) { [weak self] obj in
                        guard
                            let dict = obj as? NSDictionary,
                            let results = dict[NSExtensionJavaScriptPreprocessingResultsKey] as? NSDictionary
                        else { return }
                        self?.pageURL = results["url"] as? String ?? ""
                        self?.pageTitle = results["title"] as? String ?? ""
                        self?.selection = results["selection"] as? String ?? ""
                        self?.excerpt = results["excerpt"] as? String ?? ""
                        self?.prefillName()
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    load(provider, UTType.url.identifier) { [weak self] obj in
                        guard let self, self.pageURL.isEmpty, let url = obj as? URL else { return }
                        self.pageURL = url.absoluteString
                        self.prefillName()
                    }
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    // Native apps (e.g. X) may share the post text alongside the URL —
                    // keep it as the note body. Don't clobber rich Safari extraction.
                    load(provider, UTType.plainText.identifier) { [weak self] obj in
                        guard let self, self.excerpt.isEmpty, let text = obj as? String else { return }
                        self.excerpt = text
                        self.prefillName()
                    }
                }
            }
        }
    }

    private func load(_ provider: NSItemProvider, _ typeID: String, _ completion: @escaping (Any?) -> Void) {
        provider.loadItem(forTypeIdentifier: typeID, options: nil) { obj, _ in
            DispatchQueue.main.async { completion(obj) }
        }
    }

    private func prefillName() {
        guard !didPrefill else { return }
        let source = pageTitle.isEmpty ? pageURL : pageTitle
        guard !source.isEmpty else { return }
        didPrefill = true
        textView.text = OmniFocusURL.defaultTaskName(source)
        // Refresh the post button's enabled/validation state.
        validateContent()
    }
}
