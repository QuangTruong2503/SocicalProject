import React from 'react';
import { Container, Row, Col } from 'react-bootstrap';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="text-dark pt-5 pb-4 mt-auto">
      <Container>
        <Row>
          {/* Cột 1: Thông tin công ty/dự án */}
          <Col lg={4} md={12} className="mb-4 mb-md-0">
            <h5 className="text-uppercase mb-4 fw-bold text-warning">
              Tran Vu Quang Truong
            </h5>
          </Col>
        </Row>

        <hr className="mb-4" />

        {/* Bản quyền và tên người chịu trách nhiệm */}
        <Row className="align-items-center">
          <Col md={7} lg={8}>
            <p className="text-center text-md-start">
              © {currentYear} Bản quyền thuộc về: 
              <a href="https://www.facebook.com/quang.truong.196493" target="_blank" rel="noopener noreferrer" className="text-warning text-decoration-none fw-bold ms-1">
                Quang Truong
              </a>
            </p>
          </Col>
          <Col md={5} lg={4}>
            <p className="text-center text-md-end">
              Phát triển bởi: <span className="text-warning fw-bold">Quang Truong</span>
            </p>
          </Col>
        </Row>
      </Container>
    </footer>
  );
};

export default Footer;