import sys
import re
import pandas as pd
import unicodedata
from pathlib import Path
from rapidfuzz import fuzz
from PyQt6.QtWidgets import (QApplication, QMainWindow, QPushButton, QVBoxLayout,
                             QHBoxLayout, QGridLayout, QWidget, QTextEdit,
                             QLineEdit, QFileDialog, QLabel, QProgressBar,
                             QMessageBox, QFrame, QListWidget, QTabWidget)
from docx import Document
import fitz  # PyMuPDF


# A decorator that catches any exceptions in the decorated function and shows an error message box.
# This prevents the app from crashing and informs the user of problems.
def safe_slot(fn):
    def wrapper(self, *args, **kwargs):
        try:
            return fn(self, *args, **kwargs)
        except Exception as exc:
            QMessageBox.critical(self, "Application Error", f"Unexpected error: {exc}")
            return None
    return wrapper

class RedactorApp(QMainWindow):
    # Initializes the main application window, sets the title and size, and calls initUI to build the interface.
    # Also sets up empty lists and variables for storing user data.
    def __init__(self):
        super().__init__()
        self.setWindowTitle("FERPA Compliance Tool")
        self.setMinimumSize(900, 650)
        self.initUI()
        self.blacklisted_terms = set()
        self.selected_files = []
        self.output_dir = None
        self.temp_output_dir = None

    # Builds the user interface by creating buttons, text boxes, labels, and layouts.
    # Arranges everything in a vertical layout for the main window.
    def initUI(self):
        self.setStyleSheet("""
            QMainWindow, QWidget#page { background: #f7f8fa; color: #172b4d; font-family: "Segoe UI"; font-size: 10pt; }
            QFrame#panel { background: #ffffff; border: 1px solid #c8d0d9; border-radius: 5px; }
            QLabel#pageTitle { color: #102a43; font-size: 17pt; font-weight: 700; }
            QLabel#muted { color: #62748a; }
            QLabel#sectionTitle { color: #173b63; font-size: 11pt; font-weight: 600; }
            QLabel#fieldLabel { color: #344b63; font-weight: 600; }
            QTextEdit, QLineEdit, QListWidget {
                background: #ffffff; border: 1px solid #c8d0d9; border-radius: 4px;
                padding: 7px; selection-background-color: #dceaf6;
            }
            QTextEdit:focus, QLineEdit:focus, QListWidget:focus { border: 1px solid #5181ad; }
            QPushButton { background: #ffffff; color: #24415f; border: 1px solid #b9c5d1; border-radius: 4px; padding: 8px 12px; }
            QPushButton:hover { background: #f0f6fc; border-color: #8ba9c6; }
            QPushButton#primaryButton { background: #176b55; color: #ffffff; border: 1px solid #176b55; padding: 11px 30px; font-weight: 700; }
            QPushButton#primaryButton:hover { background: #125743; }
            QPushButton#quietButton { color: #596c80; background: transparent; border: none; }
            QPushButton#quietButton:hover { color: #a33b3b; background: #fff5f5; }
            QTabWidget::pane { border: 1px solid #c8d0d9; border-radius: 4px; background: #ffffff; }
            QTabBar::tab { background: #edf1f5; color: #344b63; padding: 7px 13px; border: 1px solid #c8d0d9; }
            QTabBar::tab:selected { background: #ffffff; color: #173b63; }
            QProgressBar { background: #e8eef5; border: none; border-radius: 4px; height: 9px; text-align: center; }
            QProgressBar::chunk { background: #2b8068; border-radius: 4px; }
        """)

        page = QWidget()
        page.setObjectName("page")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(22, 18, 22, 18)
        layout.setSpacing(12)

        title = QLabel("FERPA Compliance Tool")
        title.setObjectName("pageTitle")
        layout.addWidget(title)

        columns = QGridLayout()
        columns.setHorizontalSpacing(14)
        columns.setVerticalSpacing(8)
        columns.setColumnStretch(0, 1)
        columns.setColumnStretch(1, 1)
        columns.setRowStretch(1, 1)

        files_title = QLabel("Select file input")
        files_title.setObjectName("sectionTitle")
        columns.addWidget(files_title, 0, 0)
        names_title = QLabel("Input names/ID to redact")
        names_title.setObjectName("sectionTitle")
        columns.addWidget(names_title, 0, 1)

        files_panel = QFrame()
        files_panel.setObjectName("panel")
        files_layout = QVBoxLayout(files_panel)
        files_layout.setContentsMargins(12, 12, 12, 12)
        files_layout.setSpacing(10)
        file_buttons = QHBoxLayout()
        file_button = QPushButton("Select file")
        file_button.clicked.connect(self.select_files)
        folder_button = QPushButton("Select folder")
        folder_button.clicked.connect(self.select_folder)
        file_buttons.addWidget(file_button)
        file_buttons.addWidget(folder_button)
        files_layout.addLayout(file_buttons)
        self.file_list = QListWidget()
        self.file_list.setAlternatingRowColors(True)
        self.file_list.setSelectionMode(QListWidget.SelectionMode.ExtendedSelection)
        self.file_list.itemSelectionChanged.connect(
            lambda: self.remove_file_button.setEnabled(bool(self.file_list.selectedItems()))
        )
        files_layout.addWidget(self.file_list, 1)
        file_actions = QHBoxLayout()
        self.remove_file_button = QPushButton("Remove selected")
        self.remove_file_button.setEnabled(False)
        self.remove_file_button.clicked.connect(self.remove_selected_files)
        self.clear_files_button = QPushButton("Clear all")
        self.clear_files_button.setObjectName("quietButton")
        self.clear_files_button.clicked.connect(self.clear_selection)
        file_actions.addWidget(self.remove_file_button)
        file_actions.addStretch()
        file_actions.addWidget(self.clear_files_button)
        files_layout.addLayout(file_actions)
        self.file_list_label = QLabel("No files selected")
        self.file_list_label.setObjectName("muted")
        files_layout.addWidget(self.file_list_label)
        columns.addWidget(files_panel, 1, 0)

        names_panel = QFrame()
        names_panel.setObjectName("panel")
        names_layout = QVBoxLayout(names_panel)
        names_layout.setContentsMargins(12, 12, 12, 12)
        names_layout.setSpacing(10)
        excel_button = QPushButton("Load from Excel")
        excel_button.clicked.connect(self.load_excel)
        names_layout.addWidget(excel_button)

        self.name_tabs = QTabWidget()
        self.prof_input = QTextEdit()
        self.prof_input.setPlaceholderText("Enter professor names, one per line")
        self.name_input = QTextEdit()
        self.name_input.setPlaceholderText("Enter student names, one per line")
        self.id_input = QTextEdit()
        self.id_input.setPlaceholderText("Enter student IDs, one per line")
        self.name_tabs.addTab(self.prof_input, "Professor names")
        self.name_tabs.addTab(self.name_input, "Student names")
        self.name_tabs.addTab(self.id_input, "Student IDs")
        names_layout.addWidget(self.name_tabs, 1)
        columns.addWidget(names_panel, 1, 1)
        layout.addLayout(columns, 1)

        options = QGridLayout()
        options.setHorizontalSpacing(14)
        options.setVerticalSpacing(6)
        prefix_label = QLabel("File naming scheme")
        prefix_label.setObjectName("fieldLabel")
        options.addWidget(prefix_label, 0, 0)
        destination_label = QLabel("Destination path")
        destination_label.setObjectName("fieldLabel")
        options.addWidget(destination_label, 0, 1)

        self.prefix_input = QLineEdit()
        self.prefix_input.setPlaceholderText("Custom naming scheme (optional)")
        options.addWidget(self.prefix_input, 1, 0)

        destination_row = QHBoxLayout()
        self.destination_input = QLineEdit()
        self.destination_input.setReadOnly(True)
        self.destination_input.setPlaceholderText("Uses the selected files' folder by default")
        destination_row.addWidget(self.destination_input, 1)
        destination_button = QPushButton("Browse")
        destination_button.clicked.connect(self.select_destination)
        destination_row.addWidget(destination_button)
        options.addLayout(destination_row, 1, 1)
        layout.addLayout(options)

        footer = QHBoxLayout()
        self.progress = QProgressBar()
        self.progress.setRange(0, 1)
        self.progress.setValue(0)
        self.progress.setFormat("Ready")
        footer.addWidget(self.progress, 1)
        self.process_btn = QPushButton("De-identify")
        self.process_btn.setObjectName("primaryButton")
        self.process_btn.clicked.connect(self.run_redaction)
        footer.addWidget(self.process_btn)
        layout.addLayout(footer)

        self.setCentralWidget(page)

    # Opens a file dialog for the user to select an Excel file (.xlsx or .xls).
    # Reads the file, determines which columns contain names and IDs based on headers,
    # and populates the name and ID text boxes with the data.
    @safe_slot
    def load_excel(self, *args, **kwargs):
        file_path, _ = QFileDialog.getOpenFileName(self, "Open Excel", "", "Excel Files (*.xlsx *.xls)")
        if file_path:
            path = Path(file_path)
            if not path.exists():
                QMessageBox.critical(self, "Excel Error", "Selected file does not exist.")
                return

            try:
                if path.suffix.lower() == ".xlsx":
                    df = pd.read_excel(path, engine="openpyxl")
                elif path.suffix.lower() == ".xls":
                    try:
                        df = pd.read_excel(path, engine="xlrd")
                    except ImportError:
                        QMessageBox.critical(self, "Excel Error", "To open .xls files install xlrd or use .xlsx files.")
                        return
                else:
                    raise ValueError("Unsupported Excel file type.")

                if df.empty:
                    QMessageBox.warning(self, "Excel Warning", "No data found in the selected Excel file.")
                    return

                # Determine columns for names and IDs
                headers = [str(col).lower() for col in df.columns]
                name_col = None
                id_col = None
                for i, header in enumerate(headers):
                    if 'name' in header:
                        name_col = i
                    elif 'id' in header:
                        id_col = i

                if name_col is None and len(df.columns) > 0:
                    name_col = 0  # Assume first column is names
                if id_col is None and len(df.columns) > 1:
                    id_col = 1  # Assume second column is IDs

                names = []
                ids = []

                for _, row in df.iterrows():
                    if name_col is not None:
                        name_val = str(row.iloc[name_col]).strip()
                        if name_val.lower() != 'nan' and name_val:
                            names.append(name_val)
                    if id_col is not None:
                        id_val = str(row.iloc[id_col]).strip()
                        if id_val.lower() != 'nan' and id_val:
                            ids.append(id_val)

                if names:
                    self.name_input.append("\n".join(names))
                if ids:
                    self.id_input.append("\n".join(ids))

                if not names and not ids:
                    QMessageBox.warning(self, "Excel Warning", "No valid data found in the selected Excel file.")
            except ImportError as e:
                QMessageBox.critical(self, "Excel Error", f"Missing package for Excel support: {e}")
            except Exception as e:
                QMessageBox.critical(self, "Excel Error", f"Failed to load Excel: {e}")

    # Opens a file dialog for the user to select individual .docx or .pdf files.
    # Adds the selected files to the list of files to process.
    @safe_slot
    def select_files(self, *args, **kwargs):
        files, _ = QFileDialog.getOpenFileNames(self, "Select Files", "", "Documents (*.docx *.pdf);;Word Documents (*.docx);;PDF Files (*.pdf)")
        if files:
            self.add_to_selected_files(files)

    # Opens a folder dialog for the user to select a directory.
    # Finds all .docx and .pdf files in that folder and adds them to the list.
    @safe_slot
    def select_folder(self, *args, **kwargs):
        folder_path = QFileDialog.getExistingDirectory(self, "Select Folder of Student Writings")
        if folder_path:
            folder = Path(folder_path)
            found_files = []
            for ext in ["*.pdf", "*.docx", "*.PDF", "*.DOCX"]:
                found_files.extend([str(f) for f in folder.glob(ext)])
            
            if found_files:
                self.add_to_selected_files(found_files)
            else:
                QMessageBox.warning(self, "No Files Found", "No PDF or DOCX files found in that folder.")

    # Adds new files to the selected files list without duplicates.
    # Updates the label showing the count and sets a default output directory if needed.
    def add_to_selected_files(self, new_files):
        allowed_extensions = {".txt", ".pdf", ".docx"}

        # Ignore files that are not TXT, PDF, or DOCX
        valid_files = [
            f for f in new_files
            if Path(f).suffix.lower() in allowed_extensions
        ]

        # Keep selection order stable while avoiding duplicate entries.
        for file_path in valid_files:
            if file_path not in self.selected_files:
                self.selected_files.append(file_path)

        self.update_file_selection()

    def update_file_selection(self):
        self.file_list.clear()
        for file_path in self.selected_files:
            self.file_list.addItem(Path(file_path).name)
            self.file_list.item(self.file_list.count() - 1).setToolTip(file_path)

        count = len(self.selected_files)
        self.file_list_label.setText(
            "No files selected" if count == 0 else
            f"{count} file{'s' if count != 1 else ''} selected"
        )
        self.remove_file_button.setEnabled(False)
        self.clear_files_button.setEnabled(bool(count))

        if not self.output_dir:
            self.temp_output_dir = (
                Path(self.selected_files[0]).parent / "Redacted_Output"
                if self.selected_files else None
            )
            self.destination_input.clear()
            self.destination_input.setPlaceholderText(
                str(self.temp_output_dir) if self.temp_output_dir
                else "Uses the selected files' folder by default"
            )

    def remove_selected_files(self):
        selected_rows = {
            self.file_list.row(item) for item in self.file_list.selectedItems()
        }
        if not selected_rows:
            return

        self.selected_files = [
            path for row, path in enumerate(self.selected_files)
            if row not in selected_rows
        ]
        self.update_file_selection()

    # Clears the list of selected files and resets the label.
    def clear_selection(self):
        self.selected_files = []
        self.update_file_selection()
        
    # Parses pasted names/IDs into individual blacklist terms.
    # Supports newline, semicolon, tab separators and converts Last,First style names into full name terms.
    def parse_input_list(self, raw_text):
        entries = re.split(r'[\n;\t]+', raw_text)
        terms = []
        for entry in entries:
            entry = entry.strip()
            if not entry:
                continue

            if ',' in entry:
                parts = [p.strip() for p in entry.split(',') if p.strip()]
                if len(parts) == 2:
                    last, first = parts
                    terms.append(f"{first} {last}")
                    continue
                # Fall back to splitting across commas when there are more than two segments.
                for part in parts:
                    if part:
                        terms.append(part)
                continue

            terms.append(entry)

        return terms

    # Normalizes professor names by removing common titles like Dr., Prof., Mr., etc.
    def normalize_name(self, name):
        name = name.strip()
        name = re.sub(r'^(?:dr|prof|professor|mr|mrs|ms|miss|mx)\.?\s+', '', name, flags=re.IGNORECASE)
        name = re.sub(r'\s+', ' ', name).strip()
        return name

    # Opens a folder dialog for the user to choose where to save the redacted files.
    # Sets the output directory for saving results.
    @safe_slot
    def select_destination(self, *args, **kwargs):
        folder_path = QFileDialog.getExistingDirectory(self, "Select Destination Folder")
        if folder_path:
            selected_folder = Path(folder_path)
            self.output_dir = selected_folder / "Redacted_Output"
            self.destination_input.setText(str(self.output_dir))

    # Starts the redaction process: collects names and IDs from text boxes,
    # checks for selected files, creates output directory, and processes each file.
    # Shows progress and a completion message.
    @safe_slot
    def run_redaction(self, *args, **kwargs):
        raw_professors = [self.normalize_name(t) for t in self.parse_input_list(self.prof_input.toPlainText())]
        raw_names = self.parse_input_list(self.name_input.toPlainText())
        raw_ids = self.parse_input_list(self.id_input.toPlainText())
        self.blacklisted_terms = {t for t in raw_professors + raw_names + raw_ids if len(t) > 1}
        header_terms = set(raw_professors + raw_names + raw_ids)
        for term in raw_professors + raw_names:
            if ' ' in term:
                parts = term.split()
                header_terms.update(parts)
        self.header_terms = {t for t in header_terms if len(t) > 1}
        
        self.selected_files = [f for f in self.selected_files if Path(f).exists()]
        if not self.selected_files or not self.blacklisted_terms:
            QMessageBox.warning(self, "Missing Data", "Need files and names/IDs! Make sure selected files still exist.")
            return
        
        # Determine final output path
        final_output = self.output_dir if self.output_dir else self.temp_output_dir
        if not final_output:
            QMessageBox.critical(self, "Error", "No output directory determined.")
            return

        try:
            final_output.mkdir(exist_ok=True, parents=True)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Could not create directory: {e}")
            return

        custom_prefix = self.prefix_input.text().strip()
        file_prefix = custom_prefix if custom_prefix else "Student"
        
        self.progress.setMaximum(len(self.selected_files))
        self.progress.setValue(0)
        self.progress.setFormat("Processing: %p%")

        for i, f_path in enumerate(self.selected_files):
            try:
                file_path = Path(f_path)
                out_path = final_output / f"{file_prefix}_{i+1}.txt"

                if file_path.suffix.lower() == ".docx":
                    self.redact_docx_to_txt(file_path, out_path)
                elif file_path.suffix.lower() == ".pdf":
                    self.redact_pdf_to_txt(file_path, out_path)
                else:
                    raise ValueError(f"Unsupported file type: {file_path.suffix}")
            except Exception as e:
                QMessageBox.warning(self, "Processing Error", f"Could not process {f_path}: {e}")
            
            self.progress.setValue(i + 1)
        
        QMessageBox.information(self, "Finished", f"Saved to: {final_output}")
        self.progress.setFormat("Complete")

    # Replaces occurrences of a term in the text with [REDACTED], using fuzzy matching for similarity.
    # Handles single words or full names by looking for matches in the text.
    def fuzzy_replace(self, text, term, threshold=80):
        term_lower = term.lower().strip()
        if not term_lower:
            return text

        redacted_text = text
        words = list(re.finditer(r'\b[\w-]+\b', text))

        if len(term_lower.split()) == 1:
            for i in range(len(words) - 1, -1, -1):
                word_match = words[i]
                word_clean = re.sub(r'[^a-zA-Z0-9]', '', word_match.group()).lower()
                if word_clean and fuzz.ratio(word_clean, term_lower) >= threshold:
                    redacted_text = redacted_text[:word_match.start()] + "[REDACTED]" + redacted_text[word_match.end():]

            pattern = rf'(?<!\w){re.escape(term_lower)}(?!\w)'
            redacted_text = re.sub(pattern, "[REDACTED]", redacted_text, flags=re.IGNORECASE)
            return redacted_text

        name_parts = [re.sub(r'[^a-zA-Z0-9]', '', part).lower() for part in term_lower.split() if part.strip()]
        if not name_parts:
            return redacted_text

        first, last = name_parts[0], name_parts[-1]
        first_initial = first[0] if first else ''
        honorific_prefix = r'(?:dr|prof|professor)\.?\s+'

        middle_token = r'(?:[A-Za-z]+\.?|[A-Za-z]\.)'
        separator = r'(?:[\s\.\-]+)'
        patterns = [
            rf'\b{re.escape(first)}[._-]{re.escape(last)}\b',
            rf'\b{re.escape(first_initial)}\.?\s+{re.escape(last)}\b',
            rf'\b{re.escape(last)}\s*,\s*{re.escape(first)}\b',
            rf'\b{re.escape(first)}(?:{separator}{middle_token}){{0,4}}{separator}{re.escape(last)}\b',
            rf'\b{honorific_prefix}{re.escape(first)}(?:{separator}{middle_token}){{0,4}}{separator}{re.escape(last)}\b'
        ]
        for p in patterns:
            redacted_text = re.sub(p, "[REDACTED]", redacted_text, flags=re.IGNORECASE)

        text_to_scan = redacted_text
        words = list(re.finditer(r'\b[\w-]+\b', text_to_scan))
        min_match = max(2, len(name_parts) - 1)
        match_ranges = []

        for seq_len in range(len(name_parts), min_match - 1, -1):
            for term_start in range(0, len(name_parts) - seq_len + 1):
                subseq = name_parts[term_start:term_start + seq_len]
                subseq_text = " ".join(subseq)
                for i in range(0, len(words) - seq_len + 1):
                    window = words[i:i + seq_len]
                    window_text = " ".join(
                        re.sub(r'[^a-zA-Z0-9]', '', w.group()).lower() for w in window
                    )
                    if fuzz.ratio(window_text, subseq_text) >= threshold:
                        match_ranges.append((window[0].start(), window[-1].end()))

        if match_ranges:
            match_ranges = sorted(match_ranges, key=lambda r: (r[0], -r[1]))
            merged_ranges = []
            for start, end in match_ranges:
                if not merged_ranges or start > merged_ranges[-1][1]:
                    merged_ranges.append([start, end])
                else:
                    merged_ranges[-1][1] = max(merged_ranges[-1][1], end)

            for start, end in reversed(merged_ranges):
                redacted_text = redacted_text[:start] + "[REDACTED]" + redacted_text[end:]

        return redacted_text

    # Applies redaction to the given text by replacing all blacklisted terms and emails with [REDACTED].
    # Processes terms in order of length to avoid conflicts.
    def redact_text(self, text):
        redacted_text = text
        for term in sorted(self.blacklisted_terms, key=lambda s: -len(s)):
            redacted_text = self.fuzzy_replace(redacted_text, term)
        redacted_text = self.redact_emails(redacted_text)
        return redacted_text

    # Finds email addresses in the text and redacts them if they contain any blacklisted terms.
    # Replaces matching emails with [REDACTED].
    def redact_emails(self, text):
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'
        emails = re.findall(email_pattern, text)
        redacted_text = text
        for email in emails:
            for term in self.blacklisted_terms:
                term_lower = term.lower().strip()
                if re.search(rf'(?<!\w){re.escape(term_lower)}(?!\w)', email.lower()):
                    redacted_text = redacted_text.replace(email, "[REDACTED]")
                    break
        return redacted_text

    # Yields all paragraphs from a DOCX document, including those in tables and headers/footers.
    # Helps to process text from all parts of the document.
    def iter_docx_paragraphs(self, doc):
        for para in doc.paragraphs:
            yield para
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for para in cell.paragraphs:
                        yield para
        for section in doc.sections:
            for part in (section.header, section.footer):
                for para in part.paragraphs:
                    yield para
                for table in part.tables:
                    for row in table.rows:
                        for cell in row.cells:
                            for para in cell.paragraphs:
                                yield para

    # Extracts all text from a DOCX document by combining text from all paragraphs.
    # Returns the full text content as a single string.
    def get_docx_text(self, doc):
        return "\n".join(para.text for para in self.iter_docx_paragraphs(doc))

    # Processes a DOCX file: extracts text, redacts it, saves as .txt, and verifies no terms remain.
    def redact_docx_to_txt(self, input_path, output_path):
        try:
            doc = Document(str(input_path))
        except Exception as e:
            raise RuntimeError(f"Unable to open DOCX file: {e}")

        raw_text = self.get_docx_text(doc)
        redacted_text = self.redact_text(raw_text)
        self.write_text_output(output_path, redacted_text)
        self.verify_text_output(output_path)

    # Extracts text from a single PDF page using PyMuPDF.
    def extract_pdf_page_text(self, page):
        return page.get_text("text")

    # Cleans up corrupted special characters found in poorly encoded PDFs.
    # Converts ligatures, accented characters, and smart quotes to their ASCII equivalents.
    # This ensures clean, readable text in the output file.
    def clean_pdf_text(self, text):
        text = unicodedata.normalize('NFKC', text)

        # Fix common PDF encoding artifacts
        text = re.sub(r'Ɵ', 'ti', text)

        replacements = {
            '–': '-',
            '—': '-',
            '“': '"',
            '”': '"',
            '‘': "'",
            '’': "'",
        }

        for k, v in replacements.items():
            text = text.replace(k, v)

        return text

    # Processes a PDF file: extracts text from all pages, redacts it, saves as .txt, and verifies.
    def redact_pdf_to_txt(self, input_path, output_path):
        try:
            doc = fitz.open(str(input_path))
        except Exception as e:
            raise RuntimeError(f"Unable to open PDF file: {e}")

        try:
            page_texts = []
            for page in doc:
                page_text = self.extract_pdf_page_text(page)
                page_text = self.clean_pdf_text(page_text)
                lines = page_text.split('\n')
                if lines and any(term.lower() in lines[0].lower() for term in self.header_terms):
                    lines[0] = "[REDACTED HEADER]"
                page_texts.append('\n'.join(lines))
            raw_text = "\n".join(page_texts)
            redacted_text = self.redact_text(raw_text)
            self.write_text_output(output_path, redacted_text)
            self.verify_text_output(output_path)
        except Exception as e:
            raise RuntimeError(f"Failed to extract or verify redacted PDF text: {e}")
        finally:
            doc.close()

    # Writes the given text to a file at the specified path.
    def write_text_output(self, output_path, text):
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(text)
        except Exception as e:
            raise RuntimeError(f"Failed to write text output: {e}")

    # Checks the output file to ensure no blacklisted terms remain.
    # Raises an error if any are found.
    def verify_text_output(self, output_path):
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                content = f.read().lower()
        except Exception as e:
            raise RuntimeError(f"Unable to verify text output: {e}")

        # match whole words only, same as fuzzy_replace
        found = [t for t in self.blacklisted_terms if re.search(rf'(?<!\w){re.escape(t.lower())}(?!\w)', content)]
        if found:
            raise RuntimeError(f"Verification failed. Unredacted terms found in text output: {', '.join(sorted(set(found)))}")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = RedactorApp()
    window.show()
    sys.exit(app.exec())