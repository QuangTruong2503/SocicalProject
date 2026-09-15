import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { listProfiles } from '../../services/profileService.js';
import { listQuotations } from '../../services/quotationService.js';
import { listKnmQuotations } from '../../services/knmQuotationService.js';
import { getWatermarkImageCountTotal } from '../../services/watermarkImageCountService.js';
import styles from './Admin.module.css';

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ users: 0, quotations: 0, knmQuotations: 0, watermarkImages: 0 });

  useEffect(() => {
    let isActive = true;

    async function load() {
      setLoading(true);
      const [profilesResult, quotations, knmQuotations, watermarkResult] = await Promise.all([
        listProfiles({}),
        listQuotations({}).catch(() => []),
        listKnmQuotations({}).catch(() => []),
        getWatermarkImageCountTotal({}),
      ]);

      if (!isActive) return;

      setStats({
        users: profilesResult.data?.length ?? 0,
        quotations: quotations?.length ?? 0,
        knmQuotations: knmQuotations?.length ?? 0,
        watermarkImages: watermarkResult.data ?? 0,
      });
      setLoading(false);
    }

    load();

    return () => { isActive = false; };
  }, []);

  return (
    <>
      <Helmet><title>Tổng quan quản trị</title></Helmet>
      <header className={styles.pageHeader}>
        <div><span>QUẢN TRỊ HỆ THỐNG</span><h1>TỔNG QUAN</h1></div>
      </header>

      <section className={styles.statGrid}>
        <Link to="/admin/users" className={styles.statCard}>
          <span>Người dùng</span>
          <strong>{loading ? '...' : formatNumber(stats.users)}</strong>
          <small>Tổng số hồ sơ trong hệ thống</small>
        </Link>
        <Link to="/admin/quotations" className={styles.statCard}>
          <span>Báo giá</span>
          <strong>{loading ? '...' : formatNumber(stats.quotations)}</strong>
          <small>Báo giá thường (chưa gồm KNM)</small>
        </Link>
        <Link to="/admin/quotations" className={styles.statCard}>
          <span>Báo giá KNM</span>
          <strong>{loading ? '...' : formatNumber(stats.knmQuotations)}</strong>
          <small>Báo giá máy móc, thiết bị</small>
        </Link>
        <Link to="/admin/watermark" className={styles.statCard}>
          <span>Ảnh Watermark</span>
          <strong>{loading ? '...' : formatNumber(stats.watermarkImages)}</strong>
          <small>Tổng số ảnh đã xử lý</small>
        </Link>
      </section>
    </>
  );
}
