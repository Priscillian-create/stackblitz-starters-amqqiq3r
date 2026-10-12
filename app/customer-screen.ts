export type DisplayScreen = {
  label?: string;
  availLeft?: number;
  availTop?: number;
  availWidth?: number;
  availHeight?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  isInternal?: boolean;
  isPrimary?: boolean;
};

export function selectCustomerScreen(screens: DisplayScreen[], current?: DisplayScreen) {
  // ScreenDetailed instances need not have the same object identity.
  // Without a known cashier screen, guessing could replace the cashier view.
  if (!current) return undefined;
  const otherScreens = screens.filter((screen) => {
    if (screen === current) return false;
    const left = screen.left ?? screen.availLeft;
    const top = screen.top ?? screen.availTop;
    const currentLeft = current.left ?? current.availLeft;
    const currentTop = current.top ?? current.availTop;
    return left !== undefined && top !== undefined &&
      currentLeft !== undefined && currentTop !== undefined &&
      (left !== currentLeft || top !== currentTop);
  });
  return otherScreens.find((screen) => screen.isInternal === false) ?? otherScreens[0];
}

export type DisplayHost = {
  location: { href: string };
  open: (url: string, target: string, features: string) => Window | null;
  alert: (message: string) => void;
  getScreenDetails?: () => Promise<{ currentScreen?: DisplayScreen; screens: DisplayScreen[] }>;
};

export async function launchCustomerDisplay(host: DisplayHost, selectedScreen?: DisplayScreen) {
  const url = new URL(host.location.href);
  url.searchParams.set("customerDisplay", "1");
  const target = "pa-gerry-customer-display";
  // Reserve the window during the click, before the permission prompt consumes
  // user activation. Load the customer route immediately, even if permission fails.
  const bounds = selectedScreen ? screenBounds(selectedScreen) : undefined;
  const features = bounds
    ? `popup=yes,left=${bounds.left},top=${bounds.top},width=${bounds.width},height=${bounds.height}`
    : "popup=yes,width=960,height=720";
  const popup = host.open(url.href, target, features);
  if (!popup) {
    host.alert("Please allow pop-ups, then open the customer display again.");
    return;
  }

  if (bounds) {
    // The screen permission was obtained during setup. No await is allowed
    // before opening this window: it must retain the button's user activation.
    popup.moveTo(bounds.left, bounds.top);
    popup.resizeTo(bounds.width, bounds.height);
    popup.focus();
    return;
  }

  let customerScreen: DisplayScreen | undefined;
  try {
    const details = await host.getScreenDetails?.();
    if (details) customerScreen = selectCustomerScreen(details.screens, details.currentScreen);
  } catch {
    // Unsupported or denied window-management permission uses manual placement.
  }

  if (popup.closed) return;
  if (customerScreen) {
    const left = Math.round(customerScreen.availLeft ?? customerScreen.left ?? 0);
    const top = Math.round(customerScreen.availTop ?? customerScreen.top ?? 0);
    const width = Math.round(customerScreen.availWidth ?? customerScreen.width ?? 960);
    const height = Math.round(customerScreen.availHeight ?? customerScreen.height ?? 720);
    try {
      // Reuse the reserved window with screen coordinates as well as moveTo:
      // POS browsers can honor creation features while ignoring moveTo alone.
      host.open(url.href, target, `popup=yes,left=${left},top=${top},width=${width},height=${height}`);
      popup.moveTo(left, top);
      popup.resizeTo(width, height);
      popup.focus();
      return;
    } catch {
      // Keep the customer route open so it can still be moved manually.
    }
  }
  host.alert("Customer display is open. If it is on the cashier screen, move this window to the customer monitor. Enable extended displays on the POS device and allow this browser to manage windows on your screens for automatic placement.");
}

function screenBounds(screen: DisplayScreen) {
  return {
    left: Math.round(screen.availLeft ?? screen.left ?? 0),
    top: Math.round(screen.availTop ?? screen.top ?? 0),
    width: Math.round(screen.availWidth ?? screen.width ?? 960),
    height: Math.round(screen.availHeight ?? screen.height ?? 720),
  };
}

export async function configureCustomerScreens(host: DisplayHost) {
  if (!host.getScreenDetails) {
    throw new Error("Automatic screen placement is unavailable. Open this POS in Chrome or Edge over HTTPS, then try again.");
  }
  const details = await host.getScreenDetails();
  if (details.screens.length < 2) {
    throw new Error("The browser sees only one screen. In Windows Display settings, select Extend these displays, then try again.");
  }
  const preferred = selectCustomerScreen(details.screens, details.currentScreen);
  if (!preferred) throw new Error("Cannot identify a separate customer monitor. Check Windows Display settings and try again.");
  return { screens: details.screens, preferred };
}
