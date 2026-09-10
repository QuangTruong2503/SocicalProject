import { KNM_DEFAULT_TERMS } from '../../utils/knmQuotation.js';

export default function TermsEditor({ terms, onChange, styles }) {
  return (
    <section className={styles.card}>
      <h2>
        Điều khoản &amp; ghi chú
        <button type="button" className={styles.restoreBtn} onClick={() => onChange(KNM_DEFAULT_TERMS)}>
          Khôi phục mặc định
        </button>
      </h2>
      <label className={styles.field}>
        <textarea
          rows={10}
          value={terms}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </section>
  );
}
