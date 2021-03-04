import { TeletypeClient } from "@atom/teletype-client";
import { Disposable } from "vscode";
import GuestPortalBinding from "./GuestPortalBinding";

export class PortalBindingManager implements Disposable {
    private client: TeletypeClient;
    private guestPortalMap: Map<string, GuestPortalBinding> = new Map();
    private activeGuestPortal?: GuestPortalBinding;

    constructor({ client }: { client: TeletypeClient }) {
        this.client = client;
    }

    createGuestPortalBinding(portalId: string): GuestPortalBinding {
        const binding = new GuestPortalBinding({
            client: this.client,
            portalId,
            editor: undefined,
            onDisposed: () => {
                this.guestPortalDispose(portalId);
            }
        });
        this.guestPortalMap.set(portalId, binding);
        return this.activeGuestPortal = binding;
    }

    getActivePortalBinding(): GuestPortalBinding | undefined {
        return this.activeGuestPortal;
    }

    private guestPortalDispose(portalId: string) {
        console.log(`GuestPortalBinding with id ${portalId} disposed`);
        this.activeGuestPortal = undefined;
        this.guestPortalMap.delete(portalId);
    }

    async dispose(): Promise<void> {
        await Promise.all(Array.from(this.guestPortalMap.values())
            .map(async portalBinding => portalBinding?.leave()));
        return;
    }
}
