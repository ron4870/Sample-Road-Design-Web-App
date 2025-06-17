#!/usr/bin/env python3
"""
cost_estimator.py - Road Design Cost Estimation Module

This module calculates construction costs for road projects based on design parameters
and quantities extracted from the 3D model. It provides material costs, unit rate
calculations, and report generation functionality.
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Union, Tuple, Any
from enum import Enum
from pathlib import Path

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, validator
import matplotlib.pyplot as plt
import seaborn as sns
from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.responses import FileResponse
import xlsxwriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database models
Base = declarative_base()

class MaterialRate(Base):
    """Database model for material unit rates"""
    __tablename__ = "material_rates"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    name = Column(String)
    unit = Column(String)
    rate = Column(Float)
    region = Column(String, index=True)
    valid_from = Column(DateTime)
    valid_to = Column(DateTime, nullable=True)
    
    def __repr__(self):
        return f"<MaterialRate(code='{self.code}', name='{self.name}', rate={self.rate})>"


class CostItem(Base):
    """Database model for cost items"""
    __tablename__ = "cost_items"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    name = Column(String)
    description = Column(String)
    unit = Column(String)
    category = Column(String, index=True)
    subcategory = Column(String, index=True)
    
    def __repr__(self):
        return f"<CostItem(code='{self.code}', name='{self.name}', unit='{self.unit}')>"


# Pydantic models for API
class MaterialRateModel(BaseModel):
    """API model for material rates"""
    code: str
    name: str
    unit: str
    rate: float
    region: str
    valid_from: datetime
    valid_to: Optional[datetime] = None
    
    class Config:
        orm_mode = True


class CostItemModel(BaseModel):
    """API model for cost items"""
    code: str
    name: str
    description: str
    unit: str
    category: str
    subcategory: str
    
    class Config:
        orm_mode = True


class VolumeData(BaseModel):
    """Model for volume data from 3D model service"""
    station_start: float
    station_end: float
    cut_volume: float = 0.0
    fill_volume: float = 0.0
    pavement_volume: float = 0.0
    base_volume: float = 0.0
    subbase_volume: float = 0.0
    
    @validator('station_end')
    def end_greater_than_start(cls, v, values):
        if 'station_start' in values and v <= values['station_start']:
            raise ValueError('station_end must be greater than station_start')
        return v


class ReportFormat(str, Enum):
    """Supported report formats"""
    CSV = "csv"
    EXCEL = "excel"
    PDF = "pdf"
    JSON = "json"


class CostEstimateRequest(BaseModel):
    """Request model for cost estimation"""
    project_id: str
    alignment_id: str
    region: str = "default"
    contingency_percentage: float = 15.0
    include_indirect_costs: bool = True
    indirect_cost_percentage: float = 25.0
    report_format: ReportFormat = ReportFormat.EXCEL


class CostBreakdown(BaseModel):
    """Cost breakdown by category"""
    earthworks: float = 0.0
    pavement: float = 0.0
    drainage: float = 0.0
    structures: float = 0.0
    traffic_control: float = 0.0
    landscaping: float = 0.0
    miscellaneous: float = 0.0
    indirect_costs: float = 0.0
    contingency: float = 0.0
    total: float = 0.0


class CostEstimateResponse(BaseModel):
    """Response model for cost estimation"""
    project_id: str
    alignment_id: str
    total_cost: float
    cost_per_km: float
    breakdown: CostBreakdown
    report_url: Optional[str] = None


class CostEstimator:
    """
    Main cost estimator class that calculates construction costs
    based on quantities and unit rates
    """
    
    def __init__(self, db_url: str = "sqlite:///./cost_estimator.db"):
        """
        Initialize the cost estimator with database connection
        
        Args:
            db_url: Database connection URL
        """
        self.engine = create_engine(db_url)
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.load_default_rates()
    
    def load_default_rates(self):
        """Load default rates if database is empty"""
        session = self.SessionLocal()
        
        # Check if we have any rates
        if session.query(MaterialRate).count() == 0:
            logger.info("Loading default material rates")
            
            # Default material rates
            default_rates = [
                {
                    "code": "ASPHALT",
                    "name": "Asphalt Concrete",
                    "unit": "m³",
                    "rate": 120.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "AGGBASE",
                    "name": "Aggregate Base Course",
                    "unit": "m³",
                    "rate": 45.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "SUBBASE",
                    "name": "Subbase Material",
                    "unit": "m³",
                    "rate": 35.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "EXCAVATION",
                    "name": "Common Excavation",
                    "unit": "m³",
                    "rate": 15.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "EMBANKMENT",
                    "name": "Embankment Fill",
                    "unit": "m³",
                    "rate": 25.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "CONCRETE",
                    "name": "Structural Concrete",
                    "unit": "m³",
                    "rate": 180.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "REBAR",
                    "name": "Reinforcing Steel",
                    "unit": "ton",
                    "rate": 1200.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "GUARDRAIL",
                    "name": "Guardrail",
                    "unit": "m",
                    "rate": 80.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "DRAINAGE_PIPE",
                    "name": "Drainage Pipe (600mm)",
                    "unit": "m",
                    "rate": 120.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "SIGNS",
                    "name": "Traffic Signs",
                    "unit": "each",
                    "rate": 350.0,
                    "region": "default",
                    "valid_from": datetime.now()
                },
                {
                    "code": "STRIPING",
                    "name": "Pavement Striping",
                    "unit": "m",
                    "rate": 2.5,
                    "region": "default",
                    "valid_from": datetime.now()
                }
            ]
            
            for rate_data in default_rates:
                rate = MaterialRate(**rate_data)
                session.add(rate)
            
            # Default cost items
            default_items = [
                {
                    "code": "EXCAVATE",
                    "name": "Roadway Excavation",
                    "description": "Excavation of material from cut sections",
                    "unit": "m³",
                    "category": "earthworks",
                    "subcategory": "excavation"
                },
                {
                    "code": "FILL",
                    "name": "Embankment Construction",
                    "description": "Placement and compaction of fill material",
                    "unit": "m³",
                    "category": "earthworks",
                    "subcategory": "fill"
                },
                {
                    "code": "ASPHALT_LAYER",
                    "name": "Asphalt Concrete Surface Course",
                    "description": "Hot mix asphalt concrete for surface layer",
                    "unit": "m³",
                    "category": "pavement",
                    "subcategory": "surface"
                },
                {
                    "code": "BASE_LAYER",
                    "name": "Aggregate Base Course",
                    "description": "Crushed aggregate base material",
                    "unit": "m³",
                    "category": "pavement",
                    "subcategory": "base"
                },
                {
                    "code": "SUBBASE_LAYER",
                    "name": "Granular Subbase",
                    "description": "Granular subbase material",
                    "unit": "m³",
                    "category": "pavement",
                    "subcategory": "subbase"
                },
                {
                    "code": "DRAIN_PIPE",
                    "name": "Drainage Pipe",
                    "description": "600mm reinforced concrete pipe",
                    "unit": "m",
                    "category": "drainage",
                    "subcategory": "pipes"
                },
                {
                    "code": "GUARD_RAIL",
                    "name": "Guardrail",
                    "description": "Standard W-beam guardrail with posts",
                    "unit": "m",
                    "category": "traffic_control",
                    "subcategory": "barriers"
                },
                {
                    "code": "TRAFFIC_SIGNS",
                    "name": "Traffic Signs",
                    "description": "Regulatory and warning signs",
                    "unit": "each",
                    "category": "traffic_control",
                    "subcategory": "signs"
                },
                {
                    "code": "PAVEMENT_MARKING",
                    "name": "Pavement Marking",
                    "description": "Thermoplastic pavement striping",
                    "unit": "m",
                    "category": "traffic_control",
                    "subcategory": "markings"
                }
            ]
            
            for item_data in default_items:
                item = CostItem(**item_data)
                session.add(item)
            
            session.commit()
        
        session.close()
    
    def get_material_rates(self, region: str = "default") -> Dict[str, float]:
        """
        Get material rates for a specific region
        
        Args:
            region: Region code for material rates
            
        Returns:
            Dictionary of material rates by code
        """
        session = self.SessionLocal()
        rates = session.query(MaterialRate).filter(
            MaterialRate.region == region,
            (MaterialRate.valid_to.is_(None) | (MaterialRate.valid_to >= datetime.now()))
        ).all()
        
        rate_dict = {rate.code: rate.rate for rate in rates}
        session.close()
        return rate_dict
    
    def get_cost_items(self) -> Dict[str, CostItem]:
        """
        Get all cost items
        
        Returns:
            Dictionary of cost items by code
        """
        session = self.SessionLocal()
        items = session.query(CostItem).all()
        item_dict = {item.code: item for item in items}
        session.close()
        return item_dict
    
    def calculate_volumes_from_model(
        self, 
        project_id: str, 
        alignment_id: str
    ) -> pd.DataFrame:
        """
        Get volume data from 3D model service
        
        In a real implementation, this would call the model service API
        For now, we'll generate some sample data
        
        Args:
            project_id: Project identifier
            alignment_id: Alignment identifier
            
        Returns:
            DataFrame with volume data by station
        """
        # This would be an API call to the model service in production
        # For now, generate sample data
        
        # Generate sample stations (0 to 1000m at 50m intervals)
        stations = np.arange(0, 1050, 50)
        
        # Generate some random volume data with realistic patterns
        np.random.seed(int(alignment_id[-1], 16))  # Use last char of alignment_id as seed
        
        # Create sample data with some correlation between adjacent stations
        cut_volumes = np.zeros(len(stations) - 1)
        fill_volumes = np.zeros(len(stations) - 1)
        
        # Generate some hills and valleys for cut/fill pattern
        terrain_profile = np.sin(stations / 200) * 10 + np.random.normal(0, 2, size=len(stations))
        road_profile = np.sin(stations / 300) * 5
        
        for i in range(len(stations) - 1):
            # Calculate cut/fill based on difference between terrain and road profiles
            diff = terrain_profile[i:i+2] - road_profile[i:i+2]
            
            # If diff is positive, we have a cut section
            cut_volumes[i] = max(0, np.mean(diff) * 20 + np.random.normal(0, 5))
            
            # If diff is negative, we have a fill section
            fill_volumes[i] = max(0, np.mean(-diff) * 20 + np.random.normal(0, 5))
        
        # Generate pavement volumes based on road width and layer thickness
        road_width = 7.2  # meters (two lanes)
        pavement_thickness = 0.05  # meters
        base_thickness = 0.15  # meters
        subbase_thickness = 0.25  # meters
        
        # Calculate volumes for each section
        section_lengths = np.diff(stations)
        pavement_volumes = road_width * pavement_thickness * section_lengths
        base_volumes = road_width * base_thickness * section_lengths
        subbase_volumes = road_width * subbase_thickness * section_lengths
        
        # Create DataFrame
        df = pd.DataFrame({
            'station_start': stations[:-1],
            'station_end': stations[1:],
            'cut_volume': cut_volumes,
            'fill_volume': fill_volumes,
            'pavement_volume': pavement_volumes,
            'base_volume': base_volumes,
            'subbase_volume': subbase_volumes
        })
        
        return df
    
    def calculate_quantities(
        self, 
        volumes_df: pd.DataFrame
    ) -> pd.DataFrame:
        """
        Calculate quantities for cost items based on volumes
        
        Args:
            volumes_df: DataFrame with volume data by station
            
        Returns:
            DataFrame with quantities by cost item
        """
        # Sum volumes across all stations
        total_volumes = volumes_df.sum()
        
        # Create quantities DataFrame
        quantities = [
            {
                'item_code': 'EXCAVATE',
                'quantity': total_volumes['cut_volume'],
                'unit': 'm³'
            },
            {
                'item_code': 'FILL',
                'quantity': total_volumes['fill_volume'],
                'unit': 'm³'
            },
            {
                'item_code': 'ASPHALT_LAYER',
                'quantity': total_volumes['pavement_volume'],
                'unit': 'm³'
            },
            {
                'item_code': 'BASE_LAYER',
                'quantity': total_volumes['base_volume'],
                'unit': 'm³'
            },
            {
                'item_code': 'SUBBASE_LAYER',
                'quantity': total_volumes['subbase_volume'],
                'unit': 'm³'
            }
        ]
        
        # Calculate length-based quantities
        road_length = volumes_df['station_end'].max() - volumes_df['station_start'].min()
        
        # Add length-based items
        quantities.extend([
            {
                'item_code': 'DRAIN_PIPE',
                'quantity': road_length * 0.5,  # Assume drainage on 50% of the road
                'unit': 'm'
            },
            {
                'item_code': 'GUARD_RAIL',
                'quantity': road_length * 0.3,  # Assume guardrail on 30% of the road
                'unit': 'm'
            },
            {
                'item_code': 'TRAFFIC_SIGNS',
                'quantity': road_length / 200,  # Assume one sign every 200m
                'unit': 'each'
            },
            {
                'item_code': 'PAVEMENT_MARKING',
                'quantity': road_length * 3,  # Assume 3 lines (center + 2 edges)
                'unit': 'm'
            }
        ])
        
        return pd.DataFrame(quantities)
    
    def calculate_costs(
        self, 
        quantities_df: pd.DataFrame, 
        rates: Dict[str, float],
        cost_items: Dict[str, CostItem]
    ) -> pd.DataFrame:
        """
        Calculate costs based on quantities and rates
        
        Args:
            quantities_df: DataFrame with quantities by cost item
            rates: Dictionary of material rates
            cost_items: Dictionary of cost items
            
        Returns:
            DataFrame with costs by item
        """
        # Map cost items to material rates
        item_to_rate = {
            'EXCAVATE': 'EXCAVATION',
            'FILL': 'EMBANKMENT',
            'ASPHALT_LAYER': 'ASPHALT',
            'BASE_LAYER': 'AGGBASE',
            'SUBBASE_LAYER': 'SUBBASE',
            'DRAIN_PIPE': 'DRAINAGE_PIPE',
            'GUARD_RAIL': 'GUARDRAIL',
            'TRAFFIC_SIGNS': 'SIGNS',
            'PAVEMENT_MARKING': 'STRIPING'
        }
        
        # Calculate cost for each item
        costs = []
        
        for _, row in quantities_df.iterrows():
            item_code = row['item_code']
            quantity = row['quantity']
            
            # Get rate for this item
            rate_code = item_to_rate.get(item_code)
            if not rate_code or rate_code not in rates:
                logger.warning(f"No rate found for item {item_code}")
                continue
                
            rate = rates[rate_code]
            cost = quantity * rate
            
            # Get item details
            item = cost_items.get(item_code)
            if not item:
                logger.warning(f"Cost item not found: {item_code}")
                continue
                
            costs.append({
                'item_code': item_code,
                'item_name': item.name,
                'category': item.category,
                'subcategory': item.subcategory,
                'quantity': quantity,
                'unit': item.unit,
                'unit_rate': rate,
                'cost': cost
            })
        
        return pd.DataFrame(costs)
    
    def add_indirect_costs(
        self, 
        costs_df: pd.DataFrame, 
        indirect_percentage: float = 25.0,
        contingency_percentage: float = 15.0
    ) -> pd.DataFrame:
        """
        Add indirect costs and contingency to the cost estimate
        
        Args:
            costs_df: DataFrame with direct costs
            indirect_percentage: Percentage for indirect costs
            contingency_percentage: Percentage for contingency
            
        Returns:
            DataFrame with all costs including indirect and contingency
        """
        # Calculate total direct cost
        direct_cost = costs_df['cost'].sum()
        
        # Calculate indirect costs and contingency
        indirect_cost = direct_cost * (indirect_percentage / 100)
        contingency = direct_cost * (contingency_percentage / 100)
        
        # Add rows for indirect costs and contingency
        indirect_row = {
            'item_code': 'INDIRECT',
            'item_name': 'Indirect Costs',
            'category': 'indirect_costs',
            'subcategory': 'overhead',
            'quantity': 1,
            'unit': 'LS',
            'unit_rate': indirect_cost,
            'cost': indirect_cost
        }
        
        contingency_row = {
            'item_code': 'CONTINGENCY',
            'item_name': 'Contingency',
            'category': 'contingency',
            'subcategory': 'risk',
            'quantity': 1,
            'unit': 'LS',
            'unit_rate': contingency,
            'cost': contingency
        }
        
        # Append rows to DataFrame
        costs_df = pd.concat([costs_df, pd.DataFrame([indirect_row, contingency_row])], ignore_index=True)
        
        return costs_df
    
    def calculate_cost_breakdown(self, costs_df: pd.DataFrame) -> CostBreakdown:
        """
        Calculate cost breakdown by category
        
        Args:
            costs_df: DataFrame with costs
            
        Returns:
            CostBreakdown object with costs by category
        """
        # Group by category and sum costs
        category_costs = costs_df.groupby('category')['cost'].sum().to_dict()
        
        # Create cost breakdown
        breakdown = CostBreakdown(
            earthworks=category_costs.get('earthworks', 0.0),
            pavement=category_costs.get('pavement', 0.0),
            drainage=category_costs.get('drainage', 0.0),
            structures=category_costs.get('structures', 0.0),
            traffic_control=category_costs.get('traffic_control', 0.0),
            landscaping=category_costs.get('landscaping', 0.0),
            miscellaneous=category_costs.get('miscellaneous', 0.0),
            indirect_costs=category_costs.get('indirect_costs', 0.0),
            contingency=category_costs.get('contingency', 0.0)
        )
        
        # Calculate total
        breakdown.total = sum(category_costs.values())
        
        return breakdown
    
    def generate_report(
        self, 
        costs_df: pd.DataFrame,
        project_id: str,
        alignment_id: str,
        format: ReportFormat = ReportFormat.EXCEL,
        output_dir: str = "./reports"
    ) -> str:
        """
        Generate cost estimate report
        
        Args:
            costs_df: DataFrame with costs
            project_id: Project identifier
            alignment_id: Alignment identifier
            format: Report format
            output_dir: Directory for report output
            
        Returns:
            Path to generated report
        """
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate timestamp for filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename_base = f"{output_dir}/cost_estimate_{project_id}_{alignment_id}_{timestamp}"
        
        if format == ReportFormat.CSV:
            # Generate CSV report
            filename = f"{filename_base}.csv"
            costs_df.to_csv(filename, index=False)
            
        elif format == ReportFormat.EXCEL:
            # Generate Excel report
            filename = f"{filename_base}.xlsx"
            self._generate_excel_report(costs_df, project_id, alignment_id, filename)
            
        elif format == ReportFormat.PDF:
            # Generate PDF report
            filename = f"{filename_base}.pdf"
            self._generate_pdf_report(costs_df, project_id, alignment_id, filename)
            
        elif format == ReportFormat.JSON:
            # Generate JSON report
            filename = f"{filename_base}.json"
            costs_df.to_json(filename, orient='records')
            
        else:
            raise ValueError(f"Unsupported report format: {format}")
        
        return filename
    
    def _generate_excel_report(
        self, 
        costs_df: pd.DataFrame,
        project_id: str,
        alignment_id: str,
        filename: str
    ):
        """Generate detailed Excel report"""
        # Create Excel writer
        writer = pd.ExcelWriter(filename, engine='xlsxwriter')
        
        # Write summary sheet
        summary = costs_df.groupby('category').agg({
            'cost': 'sum'
        }).reset_index()
        
        summary.to_excel(writer, sheet_name='Summary', index=False)
        
        # Write detailed costs sheet
        costs_df.to_excel(writer, sheet_name='Detailed Costs', index=False)
        
        # Get workbook and add formats
        workbook = writer.book
        header_format = workbook.add_format({
            'bold': True,
            'text_wrap': True,
            'valign': 'top',
            'bg_color': '#D9E1F2',
            'border': 1
        })
        
        money_format = workbook.add_format({'num_format': '$#,##0.00'})
        
        # Format summary sheet
        summary_sheet = writer.sheets['Summary']
        summary_sheet.set_column('A:A', 20)
        summary_sheet.set_column('B:B', 15, money_format)
        
        # Add title and project info
        summary_sheet.write('D1', 'Project ID:')
        summary_sheet.write('E1', project_id)
        summary_sheet.write('D2', 'Alignment ID:')
        summary_sheet.write('E2', alignment_id)
        summary_sheet.write('D3', 'Date:')
        summary_sheet.write('E3', datetime.now().strftime("%Y-%m-%d"))
        
        # Add chart
        chart = workbook.add_chart({'type': 'pie'})
        chart.add_series({
            'name': 'Cost Breakdown',
            'categories': ['Summary', 1, 0, len(summary), 0],
            'values': ['Summary', 1, 1, len(summary), 1],
        })
        chart.set_title({'name': 'Cost Breakdown by Category'})
        chart.set_style(10)
        summary_sheet.insert_chart('D5', chart, {'x_scale': 1.5, 'y_scale': 1.5})
        
        # Format detailed costs sheet
        detail_sheet = writer.sheets['Detailed Costs']
        detail_sheet.set_column('A:B', 15)
        detail_sheet.set_column('C:D', 20)
        detail_sheet.set_column('E:E', 12)
        detail_sheet.set_column('F:F', 8)
        detail_sheet.set_column('G:H', 15, money_format)
        
        # Add header format
        for col_num, value in enumerate(costs_df.columns.values):
            detail_sheet.write(0, col_num, value, header_format)
        
        # Save the workbook
        writer.close()
    
    def _generate_pdf_report(
        self, 
        costs_df: pd.DataFrame,
        project_id: str,
        alignment_id: str,
        filename: str
    ):
        """Generate detailed PDF report"""
        # Create PDF document
        doc = SimpleDocTemplate(
            filename,
            pagesize=landscape(letter),
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=18
        )
        
        # Get styles
        styles = getSampleStyleSheet()
        title_style = styles['Heading1']
        heading_style = styles['Heading2']
        normal_style = styles['Normal']
        
        # Create document elements
        elements = []
        
        # Add title
        elements.append(Paragraph("Road Construction Cost Estimate", title_style))
        elements.append(Spacer(1, 12))
        
        # Add project info
        elements.append(Paragraph(f"Project ID: {project_id}", normal_style))
        elements.append(Paragraph(f"Alignment ID: {alignment_id}", normal_style))
        elements.append(Paragraph(f"Date: {datetime.now().strftime('%Y-%m-%d')}", normal_style))
        elements.append(Spacer(1, 24))
        
        # Add cost summary
        elements.append(Paragraph("Cost Summary", heading_style))
        elements.append(Spacer(1, 12))
        
        # Create summary table
        summary = costs_df.groupby('category').agg({
            'cost': 'sum'
        }).reset_index()
        
        summary_data = [['Category', 'Cost ($)']]
        total_cost = 0
        
        for _, row in summary.iterrows():
            summary_data.append([row['category'].replace('_', ' ').title(), f"${row['cost']:,.2f}"])
            total_cost += row['cost']
        
        summary_data.append(['Total', f"${total_cost:,.2f}"])
        
        # Create table
        summary_table = Table(summary_data, colWidths=[200, 100])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        
        elements.append(summary_table)
        elements.append(Spacer(1, 24))
        
        # Add detailed costs
        elements.append(Paragraph("Detailed Costs", heading_style))
        elements.append(Spacer(1, 12))
        
        # Create detailed table
        detail_data = [['Item', 'Category', 'Quantity', 'Unit', 'Unit Rate ($)', 'Cost ($)']]
        
        for _, row in costs_df.iterrows():
            detail_data.append([
                row['item_name'],
                row['category'].replace('_', ' ').title(),
                f"{row['quantity']:,.2f}",
                row['unit'],
                f"{row['unit_rate']:,.2f}",
                f"{row['cost']:,.2f}"
            ])
        
        # Create table
        detail_table = Table(detail_data, colWidths=[150, 100, 70, 50, 80, 80])
        detail_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (2, 1), (5, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        
        elements.append(detail_table)
        
        # Generate chart data
        if len(summary) > 0:
            # Create a simple pie chart using matplotlib
            plt.figure(figsize=(6, 4))
            plt.pie(
                summary['cost'],
                labels=summary['category'].apply(lambda x: x.replace('_', ' ').title()),
                autopct='%1.1f%%',
                startangle=90
            )
            plt.axis('equal')
            plt.title('Cost Breakdown by Category')
            
            # Save chart to temporary file
            chart_path = f"{os.path.splitext(filename)[0]}_chart.png"
            plt.savefig(chart_path, dpi=100, bbox_inches='tight')
            plt.close()
            
            # Add chart to PDF
            elements.append(Spacer(1, 24))
            elements.append(Paragraph("Cost Breakdown Chart", heading_style))
            elements.append(Spacer(1, 12))
            elements.append(Image(chart_path, width=400, height=300))
            
            # Clean up temporary file
            try:
                os.remove(chart_path)
            except:
                pass
        
        # Build PDF
        doc.build(elements)
    
    def estimate_costs(self, request: CostEstimateRequest) -> CostEstimateResponse:
        """
        Generate a complete cost estimate for a road alignment
        
        Args:
            request: Cost estimate request parameters
            
        Returns:
            Cost estimate response with breakdown and report URL
        """
        try:
            # Get material rates for the specified region
            rates = self.get_material_rates(request.region)
            
            # Get cost items
            cost_items = self.get_cost_items()
            
            # Get volumes from 3D model
            volumes_df = self.calculate_volumes_from_model(request.project_id, request.alignment_id)
            
            # Calculate quantities
            quantities_df = self.calculate_quantities(volumes_df)
            
            # Calculate direct costs
            costs_df = self.calculate_costs(quantities_df, rates, cost_items)
            
            # Add indirect costs if requested
            if request.include_indirect_costs:
                costs_df = self.add_indirect_costs(
                    costs_df,
                    indirect_percentage=request.indirect_cost_percentage,
                    contingency_percentage=request.contingency_percentage
                )
            
            # Calculate cost breakdown
            breakdown = self.calculate_cost_breakdown(costs_df)
            
            # Calculate cost per km
            road_length = volumes_df['station_end'].max() - volumes_df['station_start'].min()
            cost_per_km = breakdown.total / (road_length / 1000) if road_length > 0 else 0
            
            # Generate report
            report_path = self.generate_report(
                costs_df,
                request.project_id,
                request.alignment_id,
                request.report_format
            )
            
            # Create response
            response = CostEstimateResponse(
                project_id=request.project_id,
                alignment_id=request.alignment_id,
                total_cost=breakdown.total,
                cost_per_km=cost_per_km,
                breakdown=breakdown,
                report_url=f"/reports/{os.path.basename(report_path)}"
            )
            
            return response
            
        except Exception as e:
            logger.error(f"Error estimating costs: {str(e)}", exc_info=True)
            raise


# Create FastAPI app
app = FastAPI(
    title="Road Design Cost Estimator",
    description="API for estimating road construction costs",
    version="1.0.0"
)

# Create cost estimator instance
cost_estimator = CostEstimator()

@app.post("/estimate", response_model=CostEstimateResponse)
async def estimate_costs(request: CostEstimateRequest):
    """Generate a cost estimate for a road alignment"""
    try:
        return cost_estimator.estimate_costs(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/reports/{filename}")
async def get_report(filename: str):
    """Download a generated report"""
    report_path = f"./reports/{filename}"
    if not os.path.exists(report_path):
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(report_path)

@app.get("/rates", response_model=List[MaterialRateModel])
async def get_rates(region: str = Query("default")):
    """Get material rates for a region"""
    session = cost_estimator.SessionLocal()
    rates = session.query(MaterialRate).filter(MaterialRate.region == region).all()
    session.close()
    return rates

@app.get("/items", response_model=List[CostItemModel])
async def get_items():
    """Get all cost items"""
    session = cost_estimator.SessionLocal()
    items = session.query(CostItem).all()
    session.close()
    return items

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
