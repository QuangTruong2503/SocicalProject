import React, { useState } from 'react';
import '../../styles/Banner.css';
import logo1 from '../../asset/logo1.png'; // Thay bằng ảnh logo của bạn
const Banner = () => {
  const [snowflakes] = useState(() => {
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
    return flakes;
  });

  return (
    <>
      <div className="snow-container snow-container--top">
        {snowflakes.map(flake => (
          <div key={flake.id} className="snow" style={{ left: flake.left, animationDuration: flake.animationDuration, animationDelay: flake.animationDelay }}>
            <img src={flake.logo} alt="snow" />
          </div>
        ))}
      </div>
    </>
  );
};
export default Banner;
