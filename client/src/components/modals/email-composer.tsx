import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface EmailComposerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EmailComposer({ isOpen, onClose }: EmailComposerProps) {
  const [provider, setProvider] = useState("gmail");
  const [template, setTemplate] = useState("custom");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!to || !subject || !body) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/email/send", {
        provider,
        to,
        subject,
        body,
        template: template !== "custom" ? template : undefined,
      });

      toast({
        title: "Email sent",
        description: "Your email has been sent successfully",
      });

      onClose();
      setTo("");
      setSubject("");
      setBody("");
    } catch (error) {
      toast({
        title: "Failed to send email",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger data-testid="select-email-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gmail">Gmail</SelectItem>
                  <SelectItem value="outlook">Outlook.com</SelectItem>
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
              placeholder="recipient@company.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="input-email-to"
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
                disabled={isLoading}
                data-testid="button-send-email"
              >
                {isLoading ? (
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
