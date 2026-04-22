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
            <h5 className="text-uppercase mb-4 fw-bold text-warning link-underline-warning ">
              <a href="https://www.facebook.com/quang.truong.196493" target="_blank" rel="noopener noreferrer" className="text-primary fw-bold ms-1">
                Quang Truong
              </a>
            </h5>
          </Col>
        </Row>

        <hr className="mb-4" />

        {/* Bản quyền và tên người chịu trách nhiệm */}
        <Row className="align-items-center">
          <Col md={7} lg={8}>
            <p className="text-center text-md-start">
              © {currentYear} Bản quyền thuộc về: 
              <a href="https://www.facebook.com/quang.truong.196493" target="_blank" rel="noopener noreferrer" className="text-primary text-decoration-none fw-bold ms-1">
                Quang Truong
              </a>
            </p>
          </Col>
        </Row>
      </Container>
    </footer>
  );
};

export default Footer;