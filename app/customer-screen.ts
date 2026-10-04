export type DisplayScreen = {
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

type DisplayHost = {
  location: { href: string };
  open: (url: string, target: string, features: string) => Window | null;
  alert: (message: string) => void;
  getScreenDetails?: () => Promise<{ currentScreen?: DisplayScreen; screens: DisplayScreen[] }>;
};

export async function launchCustomerDisplay(host: DisplayHost) {
  const url = new URL(host.location.href);
  url.searchParams.set("customerDisplay", "1");
  const target = "pa-gerry-customer-display";
  // Reserve the window during the click, before the permission prompt consumes
  // user activation. Load the customer route immediately, even if permission fails.
  const popup = host.open(url.href, target, "popup=yes,width=960,height=720");
  if (!popup) {
    host.alert("Please allow pop-ups, then open the customer display again.");
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
