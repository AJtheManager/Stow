# Toast Notification & Form Validation System Guide

This guide covers the enhanced toast notification system and comprehensive form validation system implemented in the Stow frontend application.

## Table of Contents

1. [Toast Notification System](#toast-notification-system)
2. [Form Validation System](#form-validation-system)
3. [Usage Examples](#usage-examples)
4. [Best Practices](#best-practices)

---

## Toast Notification System

The toast notification system provides a user-friendly way to display temporary messages, alerts, and notifications.

### Features

- **Multiple Variants**: `pending`, `success`, `error`, `info`, `warning`
- **Auto-dismiss**: Configurable auto-dismiss timers per variant
- **Action Buttons**: Optional action buttons in toasts
- **Transaction Links**: Support for blockchain transaction links
- **Accessible**: ARIA labels and semantic HTML
- **Customizable Position**: Multiple positioning options
- **Animation**: Smooth slide-in animations

### Components

#### ToastProvider

Context provider that manages toast state and rendering.

```tsx
import { ToastProvider } from "@/context/ToastProvider";

function App({ children }) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}
```

#### useToast Hook

Hook to access toast functionality from any component.

```tsx
import { useToast } from "@/context/ToastProvider";

function MyComponent() {
  const { showToast, updateToast, dismissToast } = useToast();

  const handleAction = async () => {
    // Show pending toast
    const toastId = showToast({
      variant: "pending",
      message: "Processing...",
    });

    try {
      await performAction();
      
      // Update to success
      updateToast(toastId, {
        variant: "success",
        message: "Action completed successfully!",
      });
    } catch (error) {
      // Update to error
      updateToast(toastId, {
        variant: "error",
        message: "Action failed. Please try again.",
      });
    }
  };
}
```

### Toast Variants

1. **Pending** - For ongoing operations
   - Default: Stays until updated or dismissed
   - Use: Loading states, async operations

2. **Success** - For successful operations
   - Default: Auto-dismisses after 5 seconds
   - Use: Confirmations, successful submissions

3. **Error** - For errors and failures
   - Default: Auto-dismisses after 7 seconds
   - Use: Error messages, validation failures

4. **Info** - For informational messages
   - Default: Auto-dismisses after 5 seconds
   - Use: Tips, neutral information

5. **Warning** - For warnings and cautions
   - Default: Auto-dismisses after 6 seconds
   - Use: Warnings, potential issues

### Advanced Features

#### Transaction Links

```tsx
showToast({
  variant: "success",
  message: "Transaction submitted",
  txUrl: "https://stellar.expert/explorer/public/tx/...",
  txLabel: "View on Stellar Expert",
});
```

#### Action Buttons

```tsx
showToast({
  variant: "info",
  message: "New update available",
  action: {
    label: "Reload now",
    onClick: () => window.location.reload(),
  },
});
```

#### Custom Duration

```tsx
showToast({
  variant: "success",
  message: "Copied to clipboard",
  duration: 2000, // 2 seconds
});
```

---

## Form Validation System

The form validation system provides comprehensive validation with excellent user feedback.

### Features

- **Reusable Validators**: Pre-built validation rules
- **Custom Validators**: Easy to create custom rules
- **Real-time Validation**: Validate on change, blur, or submit
- **Accessible**: ARIA attributes and semantic HTML
- **Visual Feedback**: Error, success, and hint states
- **Async Validation**: Support for async validators

### Components

#### FormField

Wrapper component that handles label, error, hint, and success messages.

```tsx
import FormField from "@/components/ui/FormField";
import Input from "@/components/ui/Input";

<FormField
  label="Email address"
  error={errors.email}
  hint="We'll never share your email"
  required
>
  <Input
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    error={!!errors.email}
  />
</FormField>
```

#### Input

Enhanced input component with validation states.

```tsx
import Input from "@/components/ui/Input";

<Input
  type="text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  error={!!error}
  success={isValid}
  placeholder="Enter text..."
/>
```

#### Textarea

Enhanced textarea component with validation states.

```tsx
import Textarea from "@/components/ui/Textarea";

<Textarea
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  error={!!errors.description}
  rows={4}
  placeholder="Enter description..."
/>
```

#### Select

Enhanced select component with validation states.

```tsx
import Select from "@/components/ui/Select";

<Select
  value={category}
  onChange={(e) => setCategory(e.target.value)}
  error={!!errors.category}
>
  <option value="">Select category</option>
  <option value="savings">Savings</option>
  <option value="investment">Investment</option>
</Select>
```

#### FormError & FormSuccess

Standalone message components for form-level feedback.

```tsx
import FormError from "@/components/ui/FormError";
import FormSuccess from "@/components/ui/FormSuccess";

{formError && <FormError message={formError} />}
{formSuccess && <FormSuccess message="Form submitted successfully!" />}
```

### Validation Library

Located in `/src/lib/validation.ts`, provides reusable validators.

#### Built-in Validators

```tsx
import { validators } from "@/lib/validation";

// Required field
validators.required("Email")

// Email validation
validators.email("Email")

// Min/Max length
validators.minLength(8, "Password")
validators.maxLength(50, "Username")

// Min/Max value
validators.min(0, "Amount")
validators.max(100, "Percentage")

// Pattern matching
validators.pattern(/^[A-Z0-9]+$/, "Must be uppercase alphanumeric")

// URL validation
validators.url("Website")

// Stellar address validation
validators.stellarAddress("Wallet address")

// Strong password
validators.strongPassword("Password")

// Match another field
validators.match(password, "Password")

// Positive number
validators.positiveNumber("Amount")

// Integer number
validators.integerNumber("Quantity")
```

#### Creating Custom Validators

```tsx
import { type ValidationRule } from "@/lib/validation";

const customValidator: ValidationRule = (value: string) => {
  if (!value.startsWith("STOW_")) {
    return "Must start with STOW_";
  }
  return null; // null means valid
};
```

### useFormValidation Hook

Custom hook for managing form state and validation.

```tsx
import { useFormValidation } from "@/hooks/useFormValidation";
import { validators } from "@/lib/validation";

function MyForm() {
  const form = useFormValidation({
    fields: {
      email: {
        value: "",
        rules: [
          validators.required("Email"),
          validators.email("Email"),
        ],
      },
      password: {
        value: "",
        rules: [
          validators.required("Password"),
          validators.strongPassword("Password"),
        ],
      },
    },
    validateOnChange: true,
    validateOnBlur: true,
  });

  const onSubmit = async (values) => {
    console.log("Form values:", values);
    // Submit logic here
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormField
        label="Email"
        error={form.touched.email ? form.errors.email : undefined}
        required
      >
        <Input
          type="email"
          value={form.values.email}
          onChange={(e) => form.handleChange("email", e.target.value)}
          onBlur={() => form.handleBlur("email")}
          error={!!(form.touched.email && form.errors.email)}
        />
      </FormField>

      <FormField
        label="Password"
        error={form.touched.password ? form.errors.password : undefined}
        required
      >
        <Input
          type="password"
          value={form.values.password}
          onChange={(e) => form.handleChange("password", e.target.value)}
          onBlur={() => form.handleBlur("password")}
          error={!!(form.touched.password && form.errors.password)}
        />
      </FormField>

      <button type="submit" disabled={!form.isValid || form.isSubmitting}>
        Submit
      </button>
    </form>
  );
}
```

---

## Usage Examples

### Example 1: Login Form with Toast Notifications

```tsx
import { useToast } from "@/context/ToastProvider";
import { useFormValidation } from "@/hooks/useFormValidation";
import { validators } from "@/lib/validation";
import FormField from "@/components/ui/FormField";
import Input from "@/components/ui/Input";

function LoginForm() {
  const { showToast, updateToast } = useToast();
  
  const form = useFormValidation({
    fields: {
      email: {
        value: "",
        rules: [validators.required("Email"), validators.email("Email")],
      },
      password: {
        value: "",
        rules: [validators.required("Password")],
      },
    },
  });

  const onSubmit = async (values) => {
    const toastId = showToast({
      variant: "pending",
      message: "Signing in...",
    });

    try {
      await login(values.email, values.password);
      
      updateToast(toastId, {
        variant: "success",
        message: "Welcome back!",
      });
    } catch (error) {
      updateToast(toastId, {
        variant: "error",
        message: error.message || "Login failed. Please try again.",
      });
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormField
        label="Email"
        error={form.touched.email ? form.errors.email : undefined}
        required
      >
        <Input
          type="email"
          value={form.values.email}
          onChange={(e) => form.handleChange("email", e.target.value)}
          onBlur={() => form.handleBlur("email")}
          error={!!(form.touched.email && form.errors.email)}
        />
      </FormField>

      <FormField
        label="Password"
        error={form.touched.password ? form.errors.password : undefined}
        required
      >
        <Input
          type="password"
          value={form.values.password}
          onChange={(e) => form.handleChange("password", e.target.value)}
          onBlur={() => form.handleBlur("password")}
          error={!!(form.touched.password && form.errors.password)}
        />
      </FormField>

      <button type="submit" disabled={!form.isValid || form.isSubmitting}>
        {form.isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
```

### Example 2: Multi-step Form

```tsx
import { useState } from "react";
import { useFormValidation } from "@/hooks/useFormValidation";
import { validators } from "@/lib/validation";

function MultiStepForm() {
  const [step, setStep] = useState(1);

  const form = useFormValidation({
    fields: {
      name: {
        value: "",
        rules: [validators.required("Name"), validators.minLength(2, "Name")],
      },
      email: {
        value: "",
        rules: [validators.required("Email"), validators.email("Email")],
      },
      amount: {
        value: "",
        rules: [validators.required("Amount"), validators.positiveNumber("Amount")],
      },
    },
  });

  const handleNextStep = () => {
    if (step === 1) {
      const nameError = form.errors.name;
      const emailError = form.errors.email;
      
      if (!nameError && !emailError) {
        setStep(2);
      }
    }
  };

  return (
    <form>
      {step === 1 && (
        <>
          <FormField label="Name" error={form.errors.name} required>
            <Input
              value={form.values.name}
              onChange={(e) => form.handleChange("name", e.target.value)}
              onBlur={() => form.handleBlur("name")}
              error={!!form.errors.name}
            />
          </FormField>

          <FormField label="Email" error={form.errors.email} required>
            <Input
              type="email"
              value={form.values.email}
              onChange={(e) => form.handleChange("email", e.target.value)}
              onBlur={() => form.handleBlur("email")}
              error={!!form.errors.email}
            />
          </FormField>

          <button type="button" onClick={handleNextStep}>
            Next
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <FormField label="Amount" error={form.errors.amount} required>
            <Input
              type="number"
              value={form.values.amount}
              onChange={(e) => form.handleChange("amount", e.target.value)}
              onBlur={() => form.handleBlur("amount")}
              error={!!form.errors.amount}
            />
          </FormField>

          <button type="button" onClick={() => setStep(1)}>
            Back
          </button>
          <button type="submit">Submit</button>
        </>
      )}
    </form>
  );
}
```

---

## Best Practices

### Toast Notifications

1. **Use Appropriate Variants**
   - Use `pending` for operations in progress
   - Use `success` for confirmations
   - Use `error` for failures
   - Use `info` for neutral messages
   - Use `warning` for cautions

2. **Keep Messages Concise**
   - Short, clear messages work best
   - Avoid technical jargon when possible
   - Provide actionable information

3. **Update Pending Toasts**
   - Always update or dismiss pending toasts
   - Don't leave users wondering about operation status

4. **Don't Overuse**
   - Not every action needs a toast
   - Silent updates are sometimes better

### Form Validation

1. **Validate Early and Often**
   - Enable `validateOnBlur` for better UX
   - Enable `validateOnChange` after first blur
   - Always validate on submit

2. **Provide Clear Error Messages**
   - Tell users exactly what's wrong
   - Suggest how to fix the issue
   - Use friendly language

3. **Use Hints Wisely**
   - Provide helpful hints before errors occur
   - Explain format requirements
   - Give examples when helpful

4. **Combine Validators**
   - Chain multiple validators for comprehensive validation
   - Order validators from most to least important
   - Return early on first error

5. **Accessible Forms**
   - Always use `required` attribute
   - Provide proper ARIA labels
   - Use semantic HTML

6. **Progressive Enhancement**
   - Start with basic validation
   - Add more sophisticated rules as needed
   - Don't over-validate

---

## Migration Guide

### Upgrading Existing Forms

To upgrade an existing form to use the new validation system:

1. Replace manual state management with `useFormValidation`
2. Replace input elements with enhanced `Input`, `Textarea`, or `Select` components
3. Wrap fields with `FormField` for consistent labeling and error display
4. Use toast notifications for async operation feedback

**Before:**
```tsx
const [email, setEmail] = useState("");
const [error, setError] = useState("");

<input
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
{error && <p>{error}</p>}
```

**After:**
```tsx
const form = useFormValidation({
  fields: {
    email: {
      value: "",
      rules: [validators.required("Email"), validators.email("Email")],
    },
  },
});

<FormField label="Email" error={form.errors.email} required>
  <Input
    type="email"
    value={form.values.email}
    onChange={(e) => form.handleChange("email", e.target.value)}
    error={!!form.errors.email}
  />
</FormField>
```

---

## API Reference

### Toast API

#### showToast(options)

Creates and displays a new toast notification.

**Parameters:**
- `variant`: `"pending" | "success" | "error" | "info" | "warning"`
- `message`: string
- `txUrl?`: string (optional transaction URL)
- `txLabel?`: string (optional transaction link label)
- `action?`: `{ label: string; onClick: () => void }` (optional action button)
- `duration?`: number | null (optional custom duration in ms)

**Returns:** `string` (toast ID)

#### updateToast(id, patch)

Updates an existing toast.

**Parameters:**
- `id`: string (toast ID from showToast)
- `patch`: Partial<ShowToastOptions>

#### dismissToast(id)

Manually dismisses a toast.

**Parameters:**
- `id`: string (toast ID)

### Validation API

#### validateField(value, rules)

Validates a single value against an array of rules.

**Returns:** `string | null` (error message or null if valid)

#### validateFields(fields)

Validates multiple fields.

**Returns:** `ValidationResult` with `isValid` and `errors`

#### composeValidators(...validators)

Combines multiple validators into one.

**Returns:** `ValidationRule`

---

## Troubleshooting

### Common Issues

1. **Toast not appearing**
   - Ensure ToastProvider wraps your app
   - Check z-index conflicts
   - Verify showToast is being called

2. **Validation not working**
   - Check validator rules are correctly defined
   - Ensure touched state is set
   - Verify error state is passed to components

3. **Form not submitting**
   - Check `isValid` state
   - Ensure all required fields are filled
   - Verify handleSubmit is called correctly

---

## Future Enhancements

Potential improvements for future versions:

- [ ] Toast stacking and grouping
- [ ] Toast persistence across page navigation
- [ ] Form field dependencies
- [ ] Async validator debouncing
- [ ] Field-level async validation
- [ ] Cross-field validation rules
- [ ] Form wizard component
- [ ] Toast sound notifications (accessibility)
- [ ] Toast position preferences
- [ ] Validation schema builder UI

---

## Contributing

When adding new validators or components:

1. Follow existing patterns and naming conventions
2. Add TypeScript types for all props
3. Include JSDoc comments
4. Ensure accessibility compliance
5. Update this guide with new features

---

## License

Part of the Stow project. See main LICENSE file for details.
