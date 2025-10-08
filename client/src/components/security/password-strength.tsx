import { CheckCircle2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PasswordStrengthProps {
  password: string;
}

interface PolicyRequirement {
  label: string;
  met: boolean;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const requirements: PolicyRequirement[] = [
    { label: "At least 12 characters", met: password.length >= 12 },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Contains lowercase letter", met: /[a-z]/.test(password) },
    { label: "Contains number", met: /[0-9]/.test(password) },
    { label: "Contains special character", met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ];

  const metCount = requirements.filter(r => r.met).length;
  const strength = (metCount / requirements.length) * 100;
  
  const getStrengthLabel = () => {
    if (metCount === 0) return "None";
    if (metCount <= 2) return "Weak";
    if (metCount <= 3) return "Medium";
    if (metCount <= 4) return "Strong";
    return "Very Strong";
  };

  const getStrengthColor = () => {
    if (metCount <= 2) return "bg-red-500";
    if (metCount <= 3) return "bg-orange-500";
    if (metCount <= 4) return "bg-yellow-500";
    return "bg-green-500";
  };

  if (!password) return null;

  return (
    <div className="space-y-3" data-testid="password-strength-indicator">
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Password Strength</span>
          <span className={`text-sm font-semibold ${
            metCount <= 2 ? "text-red-600" :
            metCount <= 3 ? "text-orange-600" :
            metCount <= 4 ? "text-yellow-600" :
            "text-green-600"
          }`} data-testid="text-strength-label">
            {getStrengthLabel()}
          </span>
        </div>
        <Progress value={strength} className="h-2" indicatorClassName={getStrengthColor()} />
      </div>
      
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Requirements:</p>
        <div className="space-y-1">
          {requirements.map((req, index) => (
            <div key={index} className="flex items-center gap-2 text-sm" data-testid={`requirement-${index}`}>
              {req.met ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={req.met ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>
                {req.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
