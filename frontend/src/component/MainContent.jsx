import React, { useState, useEffect } from "react";
import {
  Upload,
  FileText,
  MessageSquare,
  Loader2,
  Trash2,
  Download,
  Book,
  Search,
  Sparkles,
  AlertCircle,
  CheckCircle,
  X,
  Plus,
  Clock,
  FileCheck,
  Maximize2,
  Minimize2,
  Copy,
  Eye,
  Code,
} from "lucide-react";

const API_BASE_URL = "http://localhost:3000/api";

// Markdown renderer component
const MarkdownRenderer = ({ content, className = "" }) => {
  const [isRawView, setIsRawView] = useState(false);

  const renderMarkdown = (text) => {
    if (!text) return "";

    let html = text
      // Headers
      .replace(
        /^### (.*$)/gim,
        '<h3 class="text-lg font-semibold text-gray-900 mt-4 mb-2">$1</h3>'
      )
      .replace(
        /^## (.*$)/gim,
        '<h2 class="text-xl font-bold text-gray-900 mt-6 mb-3">$1</h2>'
      )
      .replace(
        /^# (.*$)/gim,
        '<h1 class="text-2xl font-bold text-gray-900 mt-6 mb-4">$1</h1>'
      )

      // Bold and Italic
      .replace(
        /\*\*\*(.*?)\*\*\*/g,
        '<strong><em class="font-bold italic text-gray-900">$1</em></strong>'
      )
      .replace(
        /\*\*(.*?)\*\*/g,
        '<strong class="font-semibold text-gray-900">$1</strong>'
      )
      .replace(/\*(.*?)\*/g, '<em class="italic text-gray-700">$1</em>')

      // Code blocks
      .replace(/```[\s\S]*?```/g, (match) => {
        const code = match.replace(/```/g, "").trim();
        return `<pre class="bg-gray-100 rounded-lg p-3 my-3 overflow-x-auto border border-gray-200"><code class="text-sm font-mono text-gray-800">${code}</code></pre>`;
      })

      // Inline code
      .replace(
        /`([^`]+)`/g,
        '<code class="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-gray-800">$1</code>'
      )

      // Lists
      .replace(/^\* (.*$)/gim, '<li class="ml-4 mb-1 text-gray-700">• $1</li>')
      .replace(/^- (.*$)/gim, '<li class="ml-4 mb-1 text-gray-700">• $1</li>')
      .replace(
        /^\d+\. (.*$)/gim,
        '<li class="ml-4 mb-1 text-gray-700 list-decimal">$1</li>'
      )

      // Line breaks
      .replace(/\n\n/g, '</p><p class="mb-3 text-gray-700 leading-relaxed">')
      .replace(/\n/g, "<br/>");

    return `<div class="prose prose-sm max-w-none"><p class="mb-3 text-gray-700 leading-relaxed">${html}</p></div>`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-gray-900">
            {isRawView ? "Raw Content" : "Formatted Content"}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsRawView(!isRawView)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title={isRawView ? "Show formatted" : "Show raw"}
          >
            {isRawView ? (
              <Eye className="w-4 h-4" />
            ) : (
              <Code className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 max-h-96 overflow-y-auto">
        {isRawView ? (
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
            {content}
          </pre>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            className="text-sm"
          />
        )}
      </div>
    </div>
  );
};

const PDFProcessor = () => {
  const [pdfs, setPdfs] = useState([]);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [summaryType, setSummaryType] = useState("comprehensive");
  const [queryText, setQueryText] = useState("");
  const [queryContext, setQueryContext] = useState("full");
  const [summary, setSummary] = useState("");
  const [queryResult, setQueryResult] = useState("");
  const [notification, setNotification] = useState(null);
  const [isFullscreenSummary, setIsFullscreenSummary] = useState(false);

  useEffect(() => {
    fetchPdfs();
  }, []);

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const fetchPdfs = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/pdfs`);
      const data = await response.json();
      if (data.success) {
        setPdfs(data.pdfs);
      }
    } catch (error) {
      showNotification("Failed to fetch PDFs", "error");
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      showNotification("Please select a PDF file", "error");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const response = await fetch(`${API_BASE_URL}/upload-pdf`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        showNotification(
          `PDF "${data.metadata.originalName}" uploaded successfully!`
        );
        fetchPdfs();
        setTimeout(() => {
          const newPdf = { ...data.metadata, id: data.pdfId };
          setSelectedPdf(newPdf);
        }, 500);
      } else {
        showNotification(data.error || "Upload failed", "error");
      }
    } catch (error) {
      showNotification("Upload failed. Please try again.", "error");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const generateSummary = async (pdfId) => {
    setIsGeneratingSummary(true);
    setSummary("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/generate-summary/${pdfId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ summaryType }),
        }
      );

      const data = await response.json();
      if (data.success) {
        setSummary(data.summary);
        showNotification(`${summaryType} summary generated successfully!`);
      } else {
        showNotification(data.error || "Failed to generate summary", "error");
      }
    } catch (error) {
      showNotification(
        "Failed to generate summary. Please try again.",
        "error"
      );
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const queryPdf = async (pdfId) => {
    if (!queryText.trim()) {
      showNotification("Please enter a question", "error");
      return;
    }

    setIsQuerying(true);
    setQueryResult("");

    try {
      const response = await fetch(`${API_BASE_URL}/query-pdf/${pdfId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: queryText,
          context: queryContext,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setQueryResult(data.answer);
        showNotification("Query completed successfully!");
      } else {
        showNotification(data.error || "Query failed", "error");
      }
    } catch (error) {
      showNotification("Query failed. Please try again.", "error");
    } finally {
      setIsQuerying(false);
    }
  };

  const deletePdf = async (pdfId) => {
    if (!window.confirm("Are you sure you want to delete this PDF?")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/pdf/${pdfId}`, {
        method: "DELETE",
      });

      const data = await response.json();
      if (data.success) {
        showNotification("PDF deleted successfully!");
        fetchPdfs();
        if (selectedPdf?.id === pdfId) {
          setSelectedPdf(null);
          setSummary("");
          setQueryResult("");
        }
      } else {
        showNotification(data.error || "Failed to delete PDF", "error");
      }
    } catch (error) {
      showNotification("Failed to delete PDF. Please try again.", "error");
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const NotificationBar = () => {
    if (!notification) return null;

    return (
      <div
        className={`fixed top-4 right-4 z-50 max-w-md p-4 rounded-xl shadow-lg transition-all duration-300 ${
          notification.type === "error"
            ? "bg-red-50 border border-red-200 text-red-800"
            : "bg-green-50 border border-green-200 text-green-800"
        }`}
      >
        <div className="flex items-center gap-3">
          {notification.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-red-500" />
          ) : (
            <CheckCircle className="w-5 h-5 text-green-500" />
          )}
          <span className="flex-1">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 w-full">
      <NotificationBar />

      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg">
              <Book className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                PDF AI Processor
              </h1>
              <p className="text-gray-600 hidden sm:block">
                Upload, Summarize, and Query your PDFs with AI • Now with
                Markdown Support
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div
          className={`grid gap-8 transition-all duration-300 ${
            isFullscreenSummary ? "lg:grid-cols-1" : "lg:grid-cols-4"
          }`}
        >
          {/* Left Sidebar - PDF Management */}
          <div
            className={`${isFullscreenSummary ? "hidden" : "lg:col-span-1"}`}
          >
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-6 sticky top-32">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Your PDFs
                </h2>
                <span className="bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium px-3 py-1 rounded-full shadow-sm">
                  {pdfs.length} files
                </span>
              </div>

              {/* Upload Section */}
              <div className="mb-6">
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <button
                    disabled={isUploading}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-500 text-white px-4 py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Upload PDF
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Max 10MB • PDF format only
                </p>
              </div>

              {/* PDF List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {pdfs.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">
                      No PDFs uploaded yet
                    </p>
                  </div>
                ) : (
                  pdfs.map((pdf) => (
                    <div
                      key={pdf.id}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                        selectedPdf?.id === pdf.id
                          ? "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-md"
                          : "border-gray-100 hover:border-gray-200 hover:bg-gray-50 hover:shadow-sm"
                      }`}
                      onClick={() => setSelectedPdf(pdf)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <h3 className="font-medium text-gray-900 text-sm truncate">
                              {pdf.originalName}
                            </h3>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <FileCheck className="w-3 h-3" />
                              {pdf.pages}p
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(pdf.uploadDate)}
                            </span>
                          </div>
                          {pdf.hasSummary && (
                            <div className="mt-2">
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                Has Summary
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePdf(pdf.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Content Area */}
          <div
            className={`${
              isFullscreenSummary ? "col-span-1" : "lg:col-span-3"
            }`}
          >
            {!selectedPdf ? (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <FileText className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    Select a PDF to get started
                  </h3>
                  <p className="text-gray-600">
                    Choose a PDF from the sidebar to generate summaries and ask
                    questions with full markdown support
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Selected PDF Info */}
                <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-gray-900">
                        {selectedPdf.originalName}
                      </h2>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span>{selectedPdf.pages} pages</span>
                        <span>
                          {Math.round(selectedPdf.textLength / 1000)}k
                          characters
                        </span>
                        <span>{formatDate(selectedPdf.uploadDate)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Content Layout */}
                <div
                  className={`grid gap-8 ${
                    isFullscreenSummary ? "grid-cols-1" : "lg:grid-cols-2"
                  }`}
                >
                  {/* Summary Section - Enhanced */}
                  <div
                    className={`bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-6 ${
                      isFullscreenSummary ? "col-span-1" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-6 h-6 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          AI Summary
                        </h3>
                      </div>
                      <button
                        onClick={() =>
                          setIsFullscreenSummary(!isFullscreenSummary)
                        }
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-200"
                        title={
                          isFullscreenSummary
                            ? "Exit fullscreen"
                            : "Fullscreen view"
                        }
                      >
                        {isFullscreenSummary ? (
                          <Minimize2 className="w-5 h-5" />
                        ) : (
                          <Maximize2 className="w-5 h-5" />
                        )}
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Summary Type
                          </label>
                          <select
                            value={summaryType}
                            onChange={(e) => setSummaryType(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80 backdrop-blur-sm"
                          >
                            <option value="comprehensive">Comprehensive</option>
                            <option value="brief">Brief</option>
                            <option value="bullet-points">Bullet Points</option>
                            <option value="markdown">Markdown Format</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={() => generateSummary(selectedPdf.id)}
                            disabled={isGeneratingSummary}
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-500 text-white py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                          >
                            {isGeneratingSummary ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-5 h-5" />
                                Generate
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {summary && (
                        <div className="mt-6">
                          <MarkdownRenderer
                            content={summary}
                            className={`${
                              isFullscreenSummary ? "min-h-96" : ""
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Query Section - Only show if not in fullscreen summary mode */}
                  {!isFullscreenSummary && (
                    <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <MessageSquare className="w-6 h-6 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Ask Questions
                        </h3>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Query Context
                          </label>
                          <select
                            value={queryContext}
                            onChange={(e) => setQueryContext(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80 backdrop-blur-sm"
                          >
                            <option value="full">Full Document</option>
                            <option value="summary">Summary Only</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Your Question
                          </label>
                          <textarea
                            value={queryText}
                            onChange={(e) => setQueryText(e.target.value)}
                            placeholder="Ask anything about your PDF..."
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80 backdrop-blur-sm"
                            rows="3"
                          />
                        </div>

                        <button
                          onClick={() => queryPdf(selectedPdf.id)}
                          disabled={isQuerying || !queryText.trim()}
                          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-500 text-white py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                        >
                          {isQuerying ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Search className="w-5 h-5" />
                              Ask Question
                            </>
                          )}
                        </button>

                        {queryResult && (
                          <div className="mt-6">
                            <MarkdownRenderer content={queryResult} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PDFProcessor;
