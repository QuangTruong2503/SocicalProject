export default function CustomerInfoForm({ customer, error, onChange, styles }) {
  const patch = (name, value) => onChange({ ...customer, [name]: value });

  return (
    <section className={styles.card}>
      <h2>Thông tin khách hàng</h2>
      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.span2}`}>
          Tên công ty / khách hàng *
          <input value={customer.name} onChange={(e) => patch('name', e.target.value)} />
          {error && <small>{error}</small>}
        </label>
        <label className={styles.field}>
          Người liên hệ
          <input value={customer.contact} onChange={(e) => patch('contact', e.target.value)} />
        </label>
        <label className={styles.field}>
          Số điện thoại
          <input value={customer.phone} onChange={(e) => patch('phone', e.target.value)} />
        </label>
        <label className={styles.field}>
          Email
          <input type="email" value={customer.email} onChange={(e) => patch('email', e.target.value)} />
        </label>
        <label className={styles.field}>
          Mã số thuế
          <input value={customer.taxCode} onChange={(e) => patch('taxCode', e.target.value)} />
        </label>
        <label className={`${styles.field} ${styles.span2}`}>
          Địa chỉ
          <textarea value={customer.address} onChange={(e) => patch('address', e.target.value)} />
        </label>
      </div>
    </section>
  );
}
