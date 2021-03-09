import { TeletypeClient } from "@atom/teletype-client";
import { Disposable } from "vscode";
import GuestPortalBinding from "./GuestPortalBinding";
import { HostPortalBinding } from "./HostPortalBinding";

export class PortalBindingManager implements Disposable {
    private client: TeletypeClient;
    private guestPortalMap: Map<string, GuestPortalBinding> = new Map();
    private activeGuestPortal?: GuestPortalBinding;
    private hostPortalBinding?: HostPortalBinding;

    constructor({ client }: { client: TeletypeClient }) {
        this.client = client;
    }

    reset(): void {
        this.activeGuestPortal = this.hostPortalBinding = undefined;
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

    createOrGetHostPortalBinding(): HostPortalBinding {
        if (this.hostPortalBinding) {
            return this.hostPortalBinding;
        }
        
        const binding = new HostPortalBinding({
            client: this.client,
            onDispose() {
                // TODO
            }
        });

        return this.hostPortalBinding = binding;
    }

    getActivePortalBinding(): GuestPortalBinding | HostPortalBinding | undefined {
        return this.activeGuestPortal || this.hostPortalBinding;
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
