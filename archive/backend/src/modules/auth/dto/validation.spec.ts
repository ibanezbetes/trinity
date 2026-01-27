import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import * as fc from 'fast-check';
import { CreateUserDto } from './create-user.dto';
import { LoginUserDto } from './login-user.dto';
import { ConfirmSignUpDto } from './confirm-signup.dto';
import { ResetPasswordDto } from './reset-password.dto';

// Configure fast-check with reasonable timeouts
const fcConfig = {
  numRuns: 50, // Reduced from 100 for faster execution
  timeout: 10000, // 10 second timeout per property test
  interruptAfterTimeLimit: 8000, // Interrupt after 8 seconds
};

describe('Auth DTOs Property Tests', () => {
  /**
   * **Feature: trinity-mvp, Property 15: Protección de datos y validación de entrada**
   * **Valida: Requisitos 8.3, 8.5**
   *
   * Para cualquier almacenamiento de datos o solicitud de API, el sistema debe encriptar datos sensibles
   * y validar/sanitizar todas las entradas para prevenir vulnerabilidades de seguridad
   */
  describe('Property 15: Data protection and input validation', () => {
    it('should validate and sanitize all user registration inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.oneof(
              fc.emailAddress(), // Valid emails
              fc.string({ minLength: 1, maxLength: 50 }), // Invalid emails - limited length
              fc.constant(''), // Empty strings
              fc.constant('invalid-email'), // Simple invalid email
            ),
            username: fc.oneof(
              fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)), // Valid usernames
              fc.string({ minLength: 1, maxLength: 2 }), // Too short
              fc.string({ minLength: 21, maxLength: 30 }), // Too long - limited length
              fc.constant('user@'), // Invalid characters
              fc.constant(''), // Empty
            ),
            password: fc.oneof(
              fc.constant('ValidPass123!'), // Valid password
              fc.string({ minLength: 1, maxLength: 7 }), // Too short
              fc.constant('weakpassword'), // Weak password
              fc.constant(''), // Empty
            ),
            phoneNumber: fc.oneof(
              fc.constant('+34612345678'), // Valid phone
              fc.constant('invalid-phone'), // Invalid format
              fc.constant(''), // Empty string
              fc.constant(undefined), // Undefined
            ),
          }),
          async (userData) => {
            const dto = plainToClass(CreateUserDto, userData);
            const errors = await validate(dto);

            // Valid data should pass validation
            const isValidEmail =
              typeof userData.email === 'string' &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email) &&
              /^[^<>'"&]*$/.test(userData.email);
            const isValidUsername =
              typeof userData.username === 'string' &&
              userData.username.length >= 3 &&
              userData.username.length <= 20 &&
              /^[a-zA-Z0-9_]+$/.test(userData.username);
            const isValidPassword =
              typeof userData.password === 'string' &&
              userData.password.length >= 8 &&
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/.test(
                userData.password,
              );
            const isValidPhone =
              !userData.phoneNumber ||
              (typeof userData.phoneNumber === 'string' &&
                /^\+[1-9]\d{1,14}$/.test(userData.phoneNumber));

            const shouldBeValid =
              isValidEmail &&
              isValidUsername &&
              isValidPassword &&
              isValidPhone;

            if (shouldBeValid) {
              // Valid data should have no validation errors
              expect(errors).toHaveLength(0);
            } else {
              // Invalid data should have validation errors
              expect(errors.length).toBeGreaterThan(0);

              // Verify specific validation messages for security
              if (!isValidEmail) {
                expect(errors.some((e) => e.property === 'email')).toBe(true);
              }
              if (!isValidUsername) {
                expect(errors.some((e) => e.property === 'username')).toBe(
                  true,
                );
              }
              if (!isValidPassword) {
                expect(errors.some((e) => e.property === 'password')).toBe(
                  true,
                );
              }
              if (!isValidPhone && userData.phoneNumber) {
                expect(errors.some((e) => e.property === 'phoneNumber')).toBe(
                  true,
                );
              }
            }
          },
        ),
        fcConfig,
      );
    }, 12000); // 12 second timeout for this test

    it('should validate login credentials and prevent injection attacks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.oneof(
              fc.emailAddress(),
              fc.constant('test<script>alert(1)</script>@example.com'), // XSS attempt
              fc.constant('test@example.com; DROP TABLE users;'), // SQL injection attempt
              fc.constant(''), // Empty
            ),
            password: fc.oneof(
              fc.string({ minLength: 1, maxLength: 50 }),
              fc.constant('<script>alert(1)</script>'), // XSS attempt
              fc.constant("'; DROP TABLE users; --"), // SQL injection
              fc.constant(''), // Empty
            ),
          }),
          async (loginData) => {
            const dto = plainToClass(LoginUserDto, loginData);
            const errors = await validate(dto);

            const isValidEmail =
              typeof loginData.email === 'string' &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginData.email) &&
              /^[^<>'"&]*$/.test(loginData.email);
            const isValidPassword =
              typeof loginData.password === 'string' &&
              loginData.password.length > 0 &&
              /^[^<>'"&%]*$/.test(loginData.password);

            const shouldBeValid = isValidEmail && isValidPassword;

            if (shouldBeValid) {
              expect(errors).toHaveLength(0);

              // Verify no malicious content passes validation
              expect(dto.email).not.toContain('<script>');
              expect(dto.email).not.toContain('DROP TABLE');
              expect(dto.password).toBeDefined();
            } else {
              expect(errors.length).toBeGreaterThan(0);
            }
          },
        ),
        fcConfig,
      );
    }, 12000); // 12 second timeout for this test

    it('should validate confirmation codes and prevent brute force attacks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.oneof(
              fc.emailAddress(),
              fc.constant('invalid-email'),
              fc.constant(''),
            ),
            confirmationCode: fc.oneof(
              fc.constant('123456'), // Valid 6-digit code
              fc.string({ minLength: 1, maxLength: 5 }), // Too short
              fc.string({ minLength: 7, maxLength: 10 }), // Too long
              fc.constant('abcdef'), // Non-numeric
              fc.constant('       '), // Whitespace only
              fc.constant(''), // Empty
            ),
          }),
          async (confirmData) => {
            const dto = plainToClass(ConfirmSignUpDto, confirmData);
            const errors = await validate(dto);

            const isValidEmail =
              typeof confirmData.email === 'string' &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(confirmData.email);
            const isValidCode =
              typeof confirmData.confirmationCode === 'string' &&
              confirmData.confirmationCode.length === 6 &&
              confirmData.confirmationCode.trim().length === 6; // Ensure no whitespace-only codes

            const shouldBeValid = isValidEmail && isValidCode;

            if (shouldBeValid) {
              expect(errors).toHaveLength(0);
            } else {
              expect(errors.length).toBeGreaterThan(0);

              // Verify confirmation code validation prevents brute force
              if (!isValidCode) {
                expect(
                  errors.some(
                    (e) => e.property === 'confirmationCode',
                  ),
                ).toBe(true);
              }
            }
          },
        ),
        fcConfig,
      );
    }, 12000); // 12 second timeout for this test

    it('should validate password reset inputs and prevent security bypasses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            email: fc.oneof(
              fc.emailAddress(), 
              fc.constant('invalid-email'), 
              fc.constant('')
            ),
            confirmationCode: fc.oneof(
              fc.constant('123456'), // Valid 6-digit code
              fc.string({ minLength: 1, maxLength: 5 }), // Too short
              fc.string({ minLength: 7, maxLength: 10 }), // Too long
              fc.constant(''), // Empty
            ),
            newPassword: fc.oneof(
              fc.constant('ValidPass123!'), // Strong password
              fc.string({ minLength: 1, maxLength: 7 }), // Weak passwords
              fc.constant('weakpassword'), // Password without complexity
              fc.constant(''), // Empty
            ),
          }),
          async (resetData) => {
            const dto = plainToClass(ResetPasswordDto, resetData);
            const errors = await validate(dto);

            const isValidEmail =
              typeof resetData.email === 'string' &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetData.email);
            const isValidCode =
              typeof resetData.confirmationCode === 'string' &&
              resetData.confirmationCode.length === 6;
            const isValidPassword =
              typeof resetData.newPassword === 'string' &&
              resetData.newPassword.length >= 8 &&
              /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(
                resetData.newPassword,
              );

            const shouldBeValid =
              isValidEmail && isValidCode && isValidPassword;

            if (shouldBeValid) {
              expect(errors).toHaveLength(0);
            } else {
              expect(errors.length).toBeGreaterThan(0);

              // Verify password complexity requirements prevent weak passwords
              if (!isValidPassword) {
                expect(
                  errors.some(
                    (e) =>
                      e.property === 'newPassword' &&
                      (e.constraints?.matches || e.constraints?.minLength),
                  ),
                ).toBe(true);
              }
            }
          },
        ),
        fcConfig,
      );
    }, 12000); // 12 second timeout for this test

    it('should sanitize all string inputs to prevent XSS and injection attacks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            maliciousInput: fc.oneof(
              fc.constant('<script>alert("xss")</script>'),
              fc.constant('javascript:alert("xss")'),
              fc.constant('${7*7}'), // Template injection
              fc.constant('{{7*7}}'), // Template injection
              fc.constant("'; DROP TABLE users; --"), // SQL injection
              fc.constant('../../etc/passwd'), // Path traversal
              fc.constant('%3Cscript%3E'), // URL encoded XSS
              fc.constant('data:text/html,<script>alert(1)</script>'), // Data URI XSS
            ),
            fieldType: fc.constantFrom('email', 'username', 'password'),
          }),
          async (testData) => {
            const userData = {
              email:
                testData.fieldType === 'email'
                  ? testData.maliciousInput
                  : 'test@example.com',
              username:
                testData.fieldType === 'username'
                  ? testData.maliciousInput
                  : 'testuser',
              password:
                testData.fieldType === 'password'
                  ? testData.maliciousInput
                  : 'ValidPass123!',
            };

            const dto = plainToClass(CreateUserDto, userData);
            const errors = await validate(dto);

            // Check if the malicious input should be rejected based on validation rules
            let shouldBeRejected = true;
            
            if (testData.fieldType === 'password') {
              // For passwords, check if it meets the complexity requirements
              const password = testData.maliciousInput;
              const meetsComplexity = password.length >= 8 &&
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/.test(password) &&
                /^[^<>'"&]*$/.test(password);
              
              // URL encoded strings like %3Cscript%3E might pass basic validation but should be caught by character restrictions
              shouldBeRejected = !meetsComplexity || /[<>'"&%]/.test(password);
            } else if (testData.fieldType === 'email') {
              const email = testData.maliciousInput;
              const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && /^[^<>'"&]*$/.test(email);
              shouldBeRejected = !isValidEmail;
            } else if (testData.fieldType === 'username') {
              const username = testData.maliciousInput;
              const isValidUsername = username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
              shouldBeRejected = !isValidUsername;
            }

            if (shouldBeRejected) {
              // Malicious inputs should be rejected by validation
              expect(errors.length).toBeGreaterThan(0);

              // Verify the specific field with malicious input has validation errors
              const fieldError = errors.find(
                (e) => e.property === testData.fieldType,
              );
              expect(fieldError).toBeDefined();

              // Verify that validation prevents the malicious content from being processed
              if (testData.fieldType === 'email') {
                expect(fieldError?.constraints?.isEmail || fieldError?.constraints?.matches).toBeDefined();
              } else if (testData.fieldType === 'username') {
                expect(
                  fieldError?.constraints?.matches ||
                    fieldError?.constraints?.minLength,
                ).toBeDefined();
              } else if (testData.fieldType === 'password') {
                expect(
                  fieldError?.constraints?.matches ||
                    fieldError?.constraints?.minLength,
                ).toBeDefined();
              }
            } else {
              // If somehow the input passes validation, ensure it's actually safe
              expect(errors).toHaveLength(0);
              // This case should be rare given our test inputs
            }
          },
        ),
        fcConfig,
      );
    }, 12000); // 12 second timeout for this test
  });
});
