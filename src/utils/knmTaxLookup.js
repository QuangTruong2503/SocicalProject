const VIETQR_BUSINESS_ENDPOINT = 'https://api.vietqr.io/v2/business';

export function isLikelyTaxCode(value) {
  return /^\d{10}(-\d{3})?$/.test(String(value || '').trim());
}

export async function lookupBusinessByTaxCode(taxCode) {
  const response = await fetch(`${VIETQR_BUSINESS_ENDPOINT}/${encodeURIComponent(taxCode)}`);
  if (response.status === 429) throw new Error('Đã đạt giới hạn tra cứu mã số thuế, vui lòng thử lại sau.');
  if (!response.ok) throw new Error('Không thể tra cứu mã số thuế lúc này.');
  const json = await response.json();
  if (json.code !== '00' || !json.data) throw new Error(json.desc || 'Không tìm thấy thông tin doanh nghiệp với mã số thuế này.');
  return json.data;
}
