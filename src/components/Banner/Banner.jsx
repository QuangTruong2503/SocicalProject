import React, { useState, useEffect } from 'react';
import '../../styles/Banner.css'; // Đảm bảo bạn đã tạo file CSS này với các kiểu dáng cần thiết
import  logo from '../../asset/banner304.png'; // Đảm bảo bạn đã có ảnh logo trong thư mục assets
import logo1 from '../../asset/logo1.png'; // Thay bằng ảnh logo của bạn
const Banner = () => {
  const message = "Chào mừng ngày giải phóng Miền Nam 30 tháng 4";
  const [snowflakes, setSnowflakes] = useState([]);

  useEffect(() => {
    const flakes = [];
    for (let i = 0; i < 10; i++) { // Ít logo rơi
      flakes.push({
        id: i,
        logo: i % 2 === 0 ? logo1 : logo1,
        left: Math.random() * 100 + '%',
        animationDuration: (Math.random() * 10 + 15) + 's', // Rơi chậm
        animationDelay: Math.random() * 10 + 's',
      });
    }
    setSnowflakes(flakes);
  }, []);

  return (
    <>
      <div className="snow-container z-3">
        {snowflakes.map(flake => (
          <div key={flake.id} className="snow" style={{ left: flake.left, animationDuration: flake.animationDuration, animationDelay: flake.animationDelay }}>
            <img src={flake.logo} alt="snow" />
          </div>
        ))}
      </div>
      {/* <div className="banner-marquee-container shadow-sm fixed-top">
      <div className="banner-track">

        <div className="banner-item">
          <span className="h5 mb-0">{message}</span>
          <img src={logo} alt="Icon" className="banner-img rounded" />
        </div>
        
        <div className="banner-item">
          <span className="h5 mb-0">{message}</span>
          <img src={logo} alt="Icon" className="banner-img rounded" />
        </div>
      </div>
    </div> */}
    </>
  );
};
export default Banner;