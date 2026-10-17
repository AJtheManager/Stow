"use client";

import { useState, useCallback } from "react";
import { validateField, type ValidationRule } from "@/lib/validation";

export interface FieldConfig<T = any> {
  value: T;
  rules: ValidationRule<T>[];
  touched?: boolean;
}

export interface UseFormValidationOptions<T extends Record<string, any>> {
  fields: Record<keyof T, FieldConfig>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

export interface UseFormValidationReturn<T extends Record<string, any>> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isValid: boolean;
  isSubmitting: boolean;
  handleChange: (name: keyof T, value: any) => void;
  handleBlur: (name: keyof T) => void;
  handleSubmit: (onSubmit: (values: T) => void | Promise<void>) => (e: React.FormEvent) => Promise<void>;
  setFieldError: (name: keyof T, error: string) => void;
  setFieldValue: (name: keyof T, value: any) => void;
  resetForm: () => void;
  validateForm: () => boolean;
  setSubmitting: (isSubmitting: boolean) => void;
}

/**
 * Custom hook for comprehensive form validation with state management.
 * Provides validation on change, blur, and submit with error tracking.
 */
export function useFormValidation<T extends Record<string, any>>({
  fields,
  validateOnChange = true,
  validateOnBlur = true,
}: UseFormValidationOptions<T>): UseFormValidationReturn<T> {
  // Initialize state from fields config
  const initialValues = Object.entries(fields).reduce((acc, [key, config]) => {
    acc[key as keyof T] = (config as FieldConfig).value;
    return acc;
  }, {} as T);

  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateSingleField = useCallback(
    (name: keyof T, value: any): string | null => {
      const fieldConfig = fields[name];
      if (!fieldConfig) return null;
      return validateField(value, fieldConfig.rules);
    },
    [fields]
  );

  const handleChange = useCallback(
    (name: keyof T, value: any) => {
      setValues((prev) => ({ ...prev, [name]: value }));

      if (validateOnChange && touched[name]) {
        const error = validateSingleField(name, value);
        setErrors((prev) => ({
          ...prev,
          [name]: error || undefined,
        }));
      }
    },
    [validateOnChange, touched, validateSingleField]
  );

  const handleBlur = useCallback(
    (name: keyof T) => {
      setTouched((prev) => ({ ...prev, [name]: true }));

      if (validateOnBlur) {
        const error = validateSingleField(name, values[name]);
        setErrors((prev) => ({
          ...prev,
          [name]: error || undefined,
        }));
      }
    },
    [validateOnBlur, values, validateSingleField]
  );

  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    for (const [key, fieldConfig] of Object.entries(fields)) {
      const error = validateField(values[key as keyof T], (fieldConfig as FieldConfig).rules);
      if (error) {
        newErrors[key as keyof T] = error;
        isValid = false;
      }
    }

    setErrors(newErrors);
    
    // Mark all fields as touched on validation
    const allTouched = Object.keys(fields).reduce((acc, key) => {
      acc[key as keyof T] = true;
      return acc;
    }, {} as Partial<Record<keyof T, boolean>>);
    setTouched(allTouched);

    return isValid;
  }, [fields, values]);

  const handleSubmit = useCallback(
    (onSubmit: (values: T) => void | Promise<void>) => {
      return async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
          return;
        }

        setIsSubmitting(true);
        try {
          await onSubmit(values);
        } finally {
          setIsSubmitting(false);
        }
      };
    },
    [validateForm, values]
  );

  const setFieldError = useCallback((name: keyof T, error: string) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const setFieldValue = useCallback((name: keyof T, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  const isValid = Object.keys(errors).length === 0;

  return {
    values,
    errors,
    touched,
    isValid,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldError,
    setFieldValue,
    resetForm,
    validateForm,
    setSubmitting: setIsSubmitting,
  };
}
