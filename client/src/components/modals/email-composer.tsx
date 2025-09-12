import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { EmailStatusResponse, EmailSendRequest, EmailSendResponse } from "@shared/schema";

interface EmailComposerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EmailComposer({ isOpen, onClose }: EmailComposerProps) {
  const [provider, setProvider] = useState<"outlook" | "gmail">("outlook");
  const [template, setTemplate] = useState("custom");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isHtml, setIsHtml] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch email status to determine available providers
  const { data: emailStatus } = useQuery<EmailStatusResponse>({
    queryKey: ['/api/email/status'],
  });

  // Fetch available templates
  const { data: emailProviders } = useQuery({
    queryKey: ['/api/email/providers'],
  });

  // Mutation for sending email
  const sendEmailMutation = useMutation<EmailSendResponse, Error, EmailSendRequest>({
    mutationFn: async (emailData: EmailSendRequest) => {
      const response = await apiRequest("POST", "/api/email/send", emailData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email sent",
        description: "Your email has been sent successfully",
      });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send email",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setTo("");
    setCc("");
    setSubject("");
    setBody("");
    setTemplate("custom");
  };

  const handleSend = () => {
    if (!to || (!subject && template === "custom") || (!body && template === "custom")) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // Check if provider is available
    const providerAvailable = (provider === "outlook" && emailStatus?.outlook?.isConnected) ||
                             (provider === "gmail" && emailStatus?.gmail?.isConnected);
    
    if (!providerAvailable) {
      toast({
        title: "Provider not connected",
        description: `Please connect your ${provider} account first`,
        variant: "destructive",
      });
      return;
    }

    const emailData = {
      provider,
      to: to.split(',').map(email => email.trim()),
      cc: cc ? cc.split(',').map(email => email.trim()) : undefined,
      subject,
      body,
      isHtml,
      template: template !== "custom" ? template : undefined,
      templateVariables: template !== "custom" ? {
        recipient: to.split(',')[0],
        week: new Date().toISOString().slice(0, 10),
        kpis: [],
        insights: ["Sample insight 1", "Sample insight 2"]
      } : undefined,
    };

    sendEmailMutation.mutate(emailData);
  };

  // Update provider selection when status changes
  useEffect(() => {
    if (emailStatus && provider in emailStatus) {
      const currentProvider = emailStatus[provider as keyof EmailStatusResponse];
      if (!currentProvider?.isConnected) {
        if (emailStatus.outlook?.isConnected) {
          setProvider("outlook");
        } else if (emailStatus.gmail?.isConnected) {
          setProvider("gmail");
        }
      }
    }
  }, [emailStatus, provider]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto" data-testid="email-composer-modal">
        <DialogHeader>
          <DialogTitle>Compose Email</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email Provider</Label>
              <Select value={provider} onValueChange={(value) => setProvider(value as "outlook" | "gmail")}>
                <SelectTrigger data-testid="select-email-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem 
                    value="outlook" 
                    disabled={!emailStatus?.outlook?.isConnected}
                  >
                    Outlook.com {emailStatus?.outlook?.isConnected ? "✓" : "(Not connected)"}
                  </SelectItem>
                  <SelectItem 
                    value="gmail"
                    disabled={!emailStatus?.gmail?.isConnected}
                  >
                    Gmail {emailStatus?.gmail?.isConnected ? "✓" : "(Not connected)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template</Label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger data-testid="select-email-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom Message</SelectItem>
                  <SelectItem value="weekly_report">Weekly Report</SelectItem>
                  <SelectItem value="kpi_alert">KPI Alert</SelectItem>
                  <SelectItem value="system_status">System Status Update</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              type="email"
              placeholder="recipient@company.com (separate multiple with commas)"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="input-email-to"
            />
          </div>
          
          <div>
            <Label htmlFor="email-cc">CC (Optional)</Label>
            <Input
              id="email-cc"
              type="email"
              placeholder="cc@company.com (separate multiple with commas)"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              data-testid="input-email-cc"
            />
          </div>
          
          <div>
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              placeholder="ERP Dashboard Report - Week 47"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="input-email-subject"
            />
          </div>
          
          <div>
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              rows={8}
              placeholder="Enter your message here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="resize-none"
              data-testid="textarea-email-body"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button 
                className="text-muted-foreground hover:text-foreground" 
                title="Attach KPI Report"
                data-testid="button-attach-kpi"
              >
                <i className="fas fa-chart-bar"></i>
              </button>
              <button 
                className="text-muted-foreground hover:text-foreground" 
                title="Attach Files"
                data-testid="button-attach-files"
              >
                <i className="fas fa-paperclip"></i>
              </button>
              <button 
                className="text-muted-foreground hover:text-foreground" 
                title="Schedule Send"
                data-testid="button-schedule-send"
              >
                <i className="fas fa-clock"></i>
              </button>
            </div>
            <div className="flex items-center space-x-3">
              <Button 
                variant="outline" 
                onClick={onClose}
                data-testid="button-cancel-email"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSend} 
                disabled={sendEmailMutation.isPending}
                data-testid="button-send-email"
              >
                {sendEmailMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane mr-2"></i>
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
