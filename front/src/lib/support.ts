/** Public support contact — shown in Help / Support and upgrade CTAs. */

export const SUPPORT_WHATSAPP_E164 = '923462734539';
export const SUPPORT_WHATSAPP_DISPLAY = '+92 346 2734539';
export const SUPPORT_EMAIL = 'info@nexmindsystems.com';

const defaultWhatsappText = "Hi, I'd like help with Raunaq POS";

export function supportWhatsappUrl(text: string = defaultWhatsappText): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(text)}`;
}

export const SUPPORT_WHATSAPP_URL = supportWhatsappUrl();
export const UPGRADE_WHATSAPP_URL = supportWhatsappUrl(
  "Hi, I'd like to upgrade my Raunaq POS plan",
);
