const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

class EmailService {
  generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async sendOrderConfirmation(order, items) {
    const itemList = items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name || 'Saree'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">₹${item.price}</td>
      </tr>
    `).join('');

    const mailOptions = {
      from: `"Banaras Heritage" <${process.env.EMAIL_USER}>`,
      to: order.customer_email,
      subject: `Order Confirmed - #${order.id} | Banaras Heritage`,
      html: `
        <div style="font-family: 'Playfair Display', serif; color: #3D2817; max-width: 600px; margin: auto; border: 1px solid #D4AF37; padding: 40px; background-color: #FDFCFB;">
          <h1 style="color: #800020; text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 20px;">Banaras Heritage</h1>
          <p>Dear ${order.customer_name},</p>
          <p>Thank you for choosing Banaras Heritage. Your order for our handcrafted masterpiece has been confirmed.</p>
          
          <h3 style="color: #800020; margin-top: 30px;">Order Summary (#${order.id})</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead style="background-color: #FAF8F6;">
              <tr>
                <th style="text-align: left; padding: 10px;">Item</th>
                <th style="text-align: left; padding: 10px;">Qty</th>
                <th style="text-align: left; padding: 10px;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemList}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding: 20px 10px 10px; font-weight: bold; text-align: right;">Total Amount:</td>
                <td style="padding: 20px 10px 10px; font-weight: bold; color: #800020;">₹${order.total_amount}</td>
              </tr>
            </tfoot>
          </table>
          
          <div style="margin-top: 40px; padding: 20px; background-color: #FAF8F6; border-radius: 8px;">
            <h4 style="margin: 0; color: #800020;">Shipping Address:</h4>
            <p style="margin: 5px 0; font-size: 14px;">
              ${order.address}, ${order.city} - ${order.pincode}<br/>
              Phone: ${order.phone}
            </p>
          </div>
          
          <p style="margin-top: 40px; font-style: italic; text-align: center; color: #D4AF37;">A new heritage begins with you.</p>
          <p style="text-align: center; font-size: 12px; color: #999; margin-top: 20px;">&copy; 2024 Banaras Heritage. All rights reserved.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Order confirmation email sent to ${order.customer_email}`);
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }

  async sendOTP(email, otp, name) {
    const mailOptions = {
      from: `"Banaras Heritage" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Password Reset OTP - Banaras Heritage`,
      html: `
        <div style="font-family: 'Playfair Display', serif; color: #3D2817; max-width: 600px; margin: auto; border: 1px solid #D4AF37; padding: 40px; background-color: #FDFCFB;">
          <h1 style="color: #800020; text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 20px;">Banaras Heritage</h1>
          <p>Dear ${name || 'Customer'},</p>
          <p>We received a request to reset your password. Please use the following 6-digit OTP to verify your identity:</p>
          
          <div style="text-align: center; margin: 40px 0;">
            <span style="font-size: 32px; font-weight: bold; color: #800020; letter-spacing: 10px; border: 2px dashed #D4AF37; padding: 10px 20px; background-color: #FAF8F6;">${otp}</span>
          </div>
          
          <p style="font-size: 14px; color: #666; text-align: center;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
          
          <p style="margin-top: 40px; font-style: italic; text-align: center; color: #D4AF37;">A new heritage begins with you.</p>
          <p style="text-align: center; font-size: 12px; color: #999; margin-top: 20px;">&copy; 2024 Banaras Heritage. All rights reserved.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Password reset OTP sent to ${email}`);
    } catch (error) {
      console.error('CRITICAL EMAIL ERROR:', error);
      if (error.code === 'EAUTH') {
        throw new Error("Email authentication failed. Please check your App Password.");
      }
      throw new Error(`Failed to send OTP email: ${error.message}`);
    }
  }

  async sendOrderStatusUpdate(order, status) {
    if (!order?.customer_email) return;
    const mailOptions = {
      from: `"Banaras Heritage" <${process.env.EMAIL_USER}>`,
      to: order.customer_email,
      subject: `Order #${order.id} Update: ${status}`,
      html: `<p>Hi ${order.customer_name || "Customer"}, your order #${order.id} status is now <b>${status}</b>.</p>`,
    };
    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error("Order status email failed:", error.message);
    }
  }
}

module.exports = new EmailService();
