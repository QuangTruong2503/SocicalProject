import { KNM_DEFAULT_TERMS } from '../../utils/knmQuotation.js';

export default function TermsEditor({ terms, onChange, readOnly, styles }) {
  return (
    <section className={styles.card}>
      <h2>
        Điều khoản &amp; ghi chú
        {!readOnly && (
          <button
            type="button"
            className={styles.restoreBtn}
            onClick={() => onChange(KNM_DEFAULT_TERMS)}
            disabled={terms === KNM_DEFAULT_TERMS}
          >
            Khôi phục mặc định
          </button>
        )}
      </h2>
      <label className={styles.field}>
        <span className={styles.srOnly}>Điều khoản và ghi chú</span>
        <textarea rows={10} value={terms} onChange={(e) => onChange(e.target.value)} disabled={readOnly} />
      </label>
    </section>
  );
}
