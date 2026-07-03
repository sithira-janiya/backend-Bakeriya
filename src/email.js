// Outbound email via Gmail SMTP (nodemailer).
//
// SMTP is configured through env (SMTP_USER + SMTP_PASS — a Gmail App Password).
// If those aren't set, we don't fail: the message is logged to the console so
// the password-change flow still works end-to-end in development.

import nodemailer from 'nodemailer'
import { config } from './config.js'

let transporter = null
if (config.smtp.user && config.smtp.pass) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  })
}

export function emailConfigured() {
  return !!transporter
}

// Sends the 6-digit password-change PIN. Returns { delivered } so callers can
// tell whether a real email went out vs. the console fallback.
export async function sendPasswordPin(to, pin) {
  const subject = 'Your Bakerya password-change PIN'
  const text =
    `Your Bakerya password-change PIN is ${pin}.\n\n` +
    `It expires in 10 minutes. If you didn't request this, you can ignore this email.`

  if (!transporter) {
    console.log(`[email] (no SMTP configured) Password-change PIN for ${to}: ${pin}`)
    return { delivered: false }
  }

  await transporter.sendMail({ from: config.smtp.from, to, subject, text })
  return { delivered: true }
}

// Sends the 6-digit email-verification code used at sign-up. Returns
// { delivered } so callers know whether a real email went out vs the console
// fallback (dev). Verifying the code proves the address actually exists.
export async function sendVerificationCode(to, code) {
  const subject = 'Verify your Bakerya email'
  const text =
    `Welcome to Bakerya! Your email verification code is ${code}.\n\n` +
    `Enter it to activate your account. It expires in 15 minutes. ` +
    `If you didn't sign up, you can ignore this email.`

  if (!transporter) {
    console.log(`[email] (no SMTP configured) Verification code for ${to}: ${code}`)
    return { delivered: false }
  }

  await transporter.sendMail({ from: config.smtp.from, to, subject, text })
  return { delivered: true }
}
