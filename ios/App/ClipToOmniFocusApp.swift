import SwiftUI
import UIKit

@main
struct ClipToOmniFocusApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                // Woken by the Share extension's cliptoomnifocus:// hand-off:
                // auto-send the clip straight through to OmniFocus.
                .onOpenURL { _ in
                    ClipStore.logEvent("app: onOpenURL fired")
                    ClipFlusher.flushOne()
                }
        }
    }
}

/// Opens queued clips in OmniFocus. One at a time, because opening a clip
/// backgrounds this app; anything still queued waits for the next send.
enum ClipFlusher {
    @MainActor
    static func flushOne(report: ((String) -> Void)? = nil) {
        guard let next = ClipStore.dequeue(), let url = URL(string: next) else {
            report?("Queue empty — nothing to send.")
            return
        }
        NSLog("[ClipToOmniFocus] opening: %@", next)
        UIApplication.shared.open(url, options: [:]) { ok in
            ClipStore.logEvent("app: open omnifocus ok=\(ok)")
            if ok {
                report?("Sent to OmniFocus ✓")
            } else {
                // Keep the clip so it isn't lost; likely OmniFocus isn't installed
                // or can't handle the URL.
                ClipStore.enqueue(next)
                NSLog("[ClipToOmniFocus] UIApplication.open returned false")
                report?("OmniFocus wouldn't open — is OmniFocus installed? (clip kept)")
            }
        }
    }
}

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var pendingCount = 0
    @State private var status = ""
    @State private var events: [String] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Label("Clip to OmniFocus", systemImage: "scissors")
                        .font(.largeTitle.bold())
                        .padding(.bottom, 4)

                    Text("Send web pages and content to OmniFocus from the Share Sheet — with the title, your selection, and a clean note, not just a bare link.")
                        .foregroundStyle(.secondary)

                    GroupBox("Pending clips") {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(pendingCount == 0
                                 ? "No clips waiting."
                                 : "^[\(pendingCount) clip](inflect: true) waiting to send.")
                                .font(.headline)

                            Button {
                                ClipFlusher.flushOne { msg in
                                    status = msg
                                    pendingCount = ClipStore.pending().count
                                    events = ClipStore.events()
                                }
                            } label: {
                                Label("Send to OmniFocus now", systemImage: "paperplane.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(pendingCount == 0)

                            if !status.isEmpty {
                                Text(status)
                                    .font(.callout)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 4)
                    }

                    GroupBox("Diagnostic log") {
                        VStack(alignment: .leading, spacing: 8) {
                            if events.isEmpty {
                                Text("No events yet.")
                                    .font(.callout)
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(Array(events.enumerated()), id: \.offset) { _, line in
                                    Text(line)
                                        .font(.system(.caption, design: .monospaced))
                                        .textSelection(.enabled)
                                }
                            }
                            Button("Clear log") {
                                ClipStore.clearEvents()
                                events = []
                            }
                            .font(.callout)
                            .padding(.top, 4)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 4)
                    }

                    GroupBox("How to use it") {
                        VStack(alignment: .leading, spacing: 12) {
                            step(1, "Tap the Share button in Safari or any app.")
                            step(2, "Choose “Clip to OmniFocus.”")
                            step(3, "Edit the task name if you like, then tap Post.")
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 4)
                    }

                    Spacer(minLength: 0)
                }
                .padding()
            }
            .navigationTitle("Clip to OmniFocus")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                pendingCount = ClipStore.pending().count
                events = ClipStore.events()
            }
            .onChange(of: scenePhase) { phase in
                if phase == .active {
                    pendingCount = ClipStore.pending().count
                    events = ClipStore.events()
                }
            }
        }
    }

    private func step(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.subheadline.bold())
                .foregroundStyle(.white)
                .frame(width: 24, height: 24)
                .background(Circle().fill(.tint))
            Text(text)
        }
    }
}
